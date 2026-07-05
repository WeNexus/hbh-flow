import { Shopify2Service } from '#lib/shopify/shopify2.service';
import { Logger } from '@nestjs/common';
import { chunk } from 'lodash-es';

/**
 * Shared helpers for the CannaDevices B2B (new Shopify store) integration,
 * used by PushCrmContactToShopifyWorkflow.
 *
 * Kept as standalone functions (not a Nest provider) so the workflow can use
 * the Shopify B2B behaviour without duplication.
 */

/** OAuth2 connection id for the NEW CannaDevices Shopify store (Shopify2Service). */
export const CANNA_NEW_CONNECTION = 'canna-devices';

/** Metafield namespace used across companies / company locations / customers. */
export const MF_NAMESPACE = 'custom';
export const MF_KEY_MARKET_ID = 'market_id';
export const MF_KEY_CRM_ACCOUNT_ID = 'crm_account_id';
export const MF_KEY_CRM_CONTACT_ID = 'crm_contact_id';

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

/**
 * Escape a value for interpolation into a Shopify search `query:` string.
 * Backslashes and double quotes are the only characters that can break the
 * (single- or double-quoted) search literal, so escape those. Prevents a stray
 * quote/character in a CRM name/email from corrupting the query.
 */
export function escapeSearch(value: unknown): string {
  return String(value ?? '').replace(/["\\]/g, '\\$&');
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

/**
 * Add the given company locations to a market's company-location condition.
 *
 * `marketUpdate.input.conditions` is a `MarketConditionsUpdateInput`
 * ({ conditionsToAdd, conditionsToDelete }). `conditionsToAdd` **appends/unions**
 * into the market's existing member set (it does NOT replace it), so you only
 * need to pass the locations you want to add — never the full list. To remove
 * members, use `conditionsToDelete` instead.
 *
 * `companyLocationsCondition` (MarketConditionsCompanyLocationsInput) is a
 * oneOf input: pass EITHER `applicationLevel` (e.g. ALL) OR `companyLocationIds`
 * — never both, or Shopify rejects it ("requires exactly one argument").
 * We always target specific locations, so we pass only `companyLocationIds`.
 *
 * `companyLocationIds` is capped at 250 per call, so we chunk (each chunk
 * appends). Skips when the list is empty.
 */
export async function marketUpdateCompanyLocations(
  shopify2: Shopify2Service,
  marketId: string,
  companyLocationIds: string[],
  connection = CANNA_NEW_CONNECTION,
): Promise<{ marketId: string; count: number; skipped: boolean }> {
  const ids = [...new Set(companyLocationIds.filter(Boolean))];
  if (!ids.length) return { marketId, count: 0, skipped: true };

  const CHUNK = 250;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunkIds = ids.slice(i, i + CHUNK);
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
                companyLocationIds: chunkIds,
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
  }

  return { marketId, count: ids.length, skipped: false };
}

/**
 * Remove the given company locations from a market's company-location condition
 * via `conditionsToDelete` (the inverse of {@link marketUpdateCompanyLocations}).
 * Used when a company's tier changes and it must leave its previous market.
 * Chunks at 250 ids per call. Skips when the list is empty.
 */
export async function marketRemoveCompanyLocations(
  shopify2: Shopify2Service,
  marketId: string,
  companyLocationIds: string[],
  connection = CANNA_NEW_CONNECTION,
): Promise<{ marketId: string; count: number; skipped: boolean }> {
  const ids = [...new Set(companyLocationIds.filter(Boolean))];
  if (!ids.length) return { marketId, count: 0, skipped: true };

  const CHUNK = 250;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunkIds = ids.slice(i, i + CHUNK);
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
            conditionsToDelete: {
              companyLocationsCondition: {
                companyLocationIds: chunkIds,
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
        `marketUpdate delete (${marketId}): ${res.userErrors.map((e) => e.message).join(', ')}`,
      );
    }
  }

  return { marketId, count: ids.length, skipped: false };
}
