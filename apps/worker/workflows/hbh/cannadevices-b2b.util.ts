import { Shopify2Service } from '#lib/shopify/shopify2.service';
import { Logger } from '@nestjs/common';
import * as readline from 'node:readline';
import { chunk } from 'lodash-es';
import axios from 'axios';

/**
 * Shared helpers for the CannaDevices B2B (new Shopify store) integration.
 *
 * These are used by both:
 *  - PushCrmContactToShopifyWorkflow (single contact, webhook driven)
 *  - MigrateOldCannaDevicesCustomersToNewWorkflow (bulk one-off migration)
 *
 * Kept as standalone functions (not a Nest provider) so both workflows can
 * share the exact same Shopify B2B behaviour without duplication.
 *
 * NOTE: the Shopify bulk-operation flow (start -> poll -> download) is exposed
 * as low-level building blocks here; the polling is driven by each workflow's
 * steps via `this.rerun()` (same pattern as EastWestInventorySync), not by a
 * blocking loop.
 */

/** OAuth2 connection id for the NEW CannaDevices Shopify store (Shopify2Service). */
export const CANNA_NEW_CONNECTION = 'canna-devices';
/** Token connection id for the OLD CannaDevices Shopify store (ShopifyService). */
export const CANNA_OLD_CONNECTION = 'cannadevices';

/** Metafield namespace used across companies / company locations / customers. */
export const MF_NAMESPACE = 'custom';
export const MF_KEY_MARKET_ID = 'market_id';
export const MF_KEY_CRM_ACCOUNT_ID = 'crm_account_id';
export const MF_KEY_CRM_CONTACT_ID = 'crm_contact_id';

/** externalId prefix used on company locations migrated from the old store. */
export const LOCATION_EXTERNAL_ID_PREFIX = 'old-addr:';

const logger = new Logger('CannaDevicesB2B');

export interface MarketRef {
  /** Full Shopify Market GID. */
  id: string;
  /** Numeric portion of the GID (what we store in the market_id metafield). */
  numericId: string;
  name: string;
}

export interface MetafieldInput {
  ownerId: string;
  namespace: string;
  key: string;
  type: string;
  value: string;
}

export interface BulkOp {
  id: string;
  status: string;
  url?: string | null;
  errorCode?: string | null;
  objectCount?: string | null;
}

/** Extract the numeric id from a Shopify GID (e.g. gid://shopify/Market/123 -> "123"). */
export function gidNumericId(gid?: string | null): string | null {
  if (gid === null || gid === undefined) return null;
  const s = gid.toString().trim();
  if (!s) return null;
  return s.includes('/') ? (s.split('/').pop() ?? null) : s;
}

/**
 * Canonical tier key used to match a CRM tier to a Shopify market. Tolerant of
 * the "Teir"/"Tier" typo (which exists in the CRM data and can't be fixed at
 * the source), case, and extra whitespace. Returns null for no B2B tier.
 */
export function tierKey(value?: string | null): string | null {
  if (value === null || value === undefined) return null;
  const raw = value.toString().trim();
  if (!raw || ['NA', 'N/A', 'None', 'null', 'undefined'].includes(raw)) {
    return null;
  }
  return raw.toLowerCase().replace(/teir/g, 'tier').replace(/\s+/g, ' ');
}

/** The account's tier display value (Price_List, falling back to Customer_Group). */
export function resolveTierName(account: {
  Price_List?: string | null;
  Customer_Group?: string | null;
}): string | null {
  const raw = (account?.Price_List || account?.Customer_Group)
    ?.toString()
    .trim();
  if (!raw || ['NA', 'N/A', 'None', 'null', 'undefined'].includes(raw)) {
    return null;
  }
  return raw;
}

/** Fetch every market on the store as { id, numericId, name }. */
export async function fetchAllMarkets(
  shopify2: Shopify2Service,
  connection = CANNA_NEW_CONNECTION,
): Promise<MarketRef[]> {
  const markets: MarketRef[] = [];
  let after: string | null = null;

  for (;;) {
    const res = await shopify2.gql<{
      nodes: Array<{ id: string; name: string }>;
      pageInfo: { hasNextPage: boolean; endCursor?: string | null };
    }>({
      connection,
      root: 'markets',
      variables: { first: 250, after },
      query: `#graphql
        query ($first: Int!, $after: String) {
          markets(first: $first, after: $after) {
            nodes { id name }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
    });

    for (const node of res?.nodes ?? []) {
      markets.push({
        id: node.id,
        numericId: gidNumericId(node.id)!,
        name: node.name,
      });
    }

    if (!res?.pageInfo?.hasNextPage) break;
    after = res.pageInfo.endCursor ?? null;
    if (!after) break;
  }

  return markets;
}

/**
 * Build a tierKey -> MarketRef map so a CRM tier can be matched to a market
 * regardless of the "Teir"/"Tier" typo or casing on either side.
 */
export async function fetchMarketsByTierKey(
  shopify2: Shopify2Service,
  connection = CANNA_NEW_CONNECTION,
): Promise<Record<string, MarketRef>> {
  const markets = await fetchAllMarkets(shopify2, connection);
  const map: Record<string, MarketRef> = {};
  for (const m of markets) {
    const key = tierKey(m.name);
    if (key) map[key] = m;
  }
  return map;
}

/** Set (create/update) metafields in batches of 25. Logs userErrors, never throws. */
export async function setMetafields(
  shopify2: Shopify2Service,
  metafields: MetafieldInput[],
  connection = CANNA_NEW_CONNECTION,
): Promise<void> {
  const clean = metafields.filter(
    (m) =>
      m.ownerId && m.value !== null && m.value !== undefined && m.value !== '',
  );
  if (!clean.length) return;

  for (const batch of chunk(clean, 25)) {
    const res = await shopify2.gql<{
      metafields: { id: string }[] | null;
      userErrors: { field: string[]; message: string }[];
    }>({
      connection,
      root: 'metafieldsSet',
      variables: { metafields: batch },
      query: `#graphql
        mutation ($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id }
            userErrors { field message }
          }
        }
      `,
    });

    if (res?.userErrors?.length) {
      logger.warn(
        `metafieldsSet: ${res.userErrors.map((e) => e.message).join(', ')}`,
      );
    }
  }
}

/** Fetch the GIDs of every location on a company. */
export async function fetchCompanyLocationIds(
  shopify2: Shopify2Service,
  companyGid: string,
  connection = CANNA_NEW_CONNECTION,
): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;

  for (;;) {
    const res = await shopify2.gql<{
      locations: {
        nodes: { id: string }[];
        pageInfo: { hasNextPage: boolean; endCursor?: string | null };
      };
    } | null>({
      connection,
      root: 'company',
      variables: { id: companyGid, first: 100, after },
      query: `#graphql
        query ($id: ID!, $first: Int!, $after: String) {
          company(id: $id) {
            locations(first: $first, after: $after) {
              nodes { id }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `,
    });

    for (const node of res?.locations?.nodes ?? []) ids.push(node.id);
    if (!res?.locations?.pageInfo?.hasNextPage) break;
    after = res.locations.pageInfo.endCursor ?? null;
    if (!after) break;
  }

  return ids;
}

// ---------------------------------------------------------------------------
// Bulk operations (start -> poll via rerun -> stream), same pattern as
// EastWestInventorySync.
// ---------------------------------------------------------------------------

/** Start a bulk query. Returns the BulkOperation; throws on userErrors. */
export async function startBulkQuery(
  shopify2: Shopify2Service,
  query: string,
  connection = CANNA_NEW_CONNECTION,
): Promise<BulkOp> {
  const res = await shopify2.gql<{
    bulkOperation: BulkOp | null;
    userErrors: { code?: string; field: string[]; message: string }[];
  }>({
    connection,
    root: 'bulkOperationRunQuery',
    variables: { query },
    query: `#graphql
      mutation ($query: String!) {
        bulkOperationRunQuery(query: $query) {
          bulkOperation { id status url errorCode objectCount }
          userErrors { code field message }
        }
      }
    `,
  });

  if (res.userErrors?.length) {
    throw new Error(
      `bulkOperationRunQuery: ${res.userErrors.map((e) => e.message).join(', ')}`,
    );
  }
  if (!res.bulkOperation?.id) {
    throw new Error('bulkOperationRunQuery: missing bulk operation');
  }
  return res.bulkOperation;
}

/** Poll a bulk operation by id. Returns the node (or null if not found). */
export async function pollBulkOperation(
  shopify2: Shopify2Service,
  id: string,
  connection = CANNA_NEW_CONNECTION,
): Promise<BulkOp | null> {
  return shopify2.gql<BulkOp | null>({
    connection,
    root: 'node',
    variables: { id },
    query: `#graphql
      query ($id: ID!) {
        node(id: $id) {
          ... on BulkOperation { id status url errorCode objectCount }
        }
      }
    `,
  });
}

/** Stream a bulk JSONL result URL, invoking `onObject` for each parsed line. */
export async function streamBulkJsonl(
  url: string,
  onObject: (obj: any) => void,
): Promise<void> {
  const res = await axios.get<NodeJS.ReadableStream>(url, {
    responseType: 'stream',
  });
  const rl = readline.createInterface({ input: res.data, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    onObject(JSON.parse(trimmed));
  }
}

/**
 * Replace a market's company-location condition with the given full list.
 *
 * Shopify does not allow adding/removing a single company location from a
 * market condition — the whole array must be supplied. `marketUpdate` takes a
 * `MarketConditionsUpdateInput` ({ conditionsToAdd, conditionsToDelete }), so
 * the condition is nested under `conditionsToAdd`; passing the whole array
 * there replaces the set. Skips when the list is empty (never wipes a market).
 *
 * `companyLocationsCondition` (MarketConditionsCompanyLocationsInput) is a
 * oneOf input: pass EITHER `applicationLevel` (e.g. ALL) OR `companyLocationIds`
 * — never both, or Shopify rejects it ("requires exactly one argument").
 * We always target specific locations, so we pass only `companyLocationIds`.
 */
export async function marketUpdateCompanyLocations(
  shopify2: Shopify2Service,
  marketId: string,
  companyLocationIds: string[],
  connection = CANNA_NEW_CONNECTION,
): Promise<{ marketId: string; count: number; skipped: boolean }> {
  const ids = [...new Set(companyLocationIds.filter(Boolean))];
  if (!ids.length) return { marketId, count: 0, skipped: true };

  const res = await shopify2.gql<{
    market: { id: string } | null;
    userErrors: { field: string[]; message: string }[];
  }>({
    connection,
    root: 'marketUpdate',
    variables: {
      id: marketId,
      input: {
        conditions: {
          conditionsToAdd: {
            companyLocationsCondition: {
              companyLocationIds: ids,
            },
          },
        },
      },
    },
    query: `#graphql
      mutation ($id: ID!, $input: MarketUpdateInput!) {
        marketUpdate(id: $id, input: $input) {
          market { id }
          userErrors { field message }
        }
      }
    `,
  });

  if (res?.userErrors?.length) {
    logger.warn(
      `marketUpdate(${marketId}): ${res.userErrors.map((e) => e.message).join(', ')}`,
    );
  }

  return { marketId, count: ids.length, skipped: false };
}

/** Map a Shopify mailing address (old store) to a Shopify CompanyAddressInput. */
export function toCompanyAddressInput(addr: {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
  countryCodeV2?: string | null;
  phone?: string | null;
}): Record<string, string> | null {
  if (!addr) return null;

  const input: Record<string, string> = {};
  if (addr.firstName) input.firstName = addr.firstName;
  if (addr.lastName) input.lastName = addr.lastName;
  if (addr.company) input.recipient = addr.company;
  if (addr.address1) input.address1 = addr.address1;
  if (addr.address2) input.address2 = addr.address2;
  if (addr.city) input.city = addr.city;
  if (addr.provinceCode) input.zoneCode = addr.provinceCode;
  if (addr.zip) input.zip = addr.zip;
  if (addr.countryCodeV2) input.countryCode = addr.countryCodeV2;
  if (addr.phone) input.phone = addr.phone;

  // Shopify requires at least a country for a company address to be usable.
  if (!input.countryCode || !input.address1) return null;
  return input;
}
