import { Shopify2Service } from '#lib/shopify/shopify2.service';
import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { MongoService } from '#lib/core/services';
import { Logger } from '@nestjs/common';
import { chunk } from 'lodash-es';
import {
  MF_KEY_CRM_ACCOUNT_ID,
  MF_KEY_MARKET_ID,
  MF_NAMESPACE,
  deleteMetafields,
  escapeSearch,
  fetchCompanyLocationsWithMarket,
  fetchMarketsByTierKey,
  gidNumericId,
  marketRemoveCompanyLocations,
  marketUpdateCompanyLocations,
  setMetafields,
  tierKey,
} from './cannadevices-b2b.util';

const ZOHO_CONNECTION = 'hbh';
const BC_CONNECTION = 'hbh';

interface Payload {
  /** CRM Account id whose tier (Customer_Group / Price_List) changed. */
  id?: string | number;
  account?: { id?: string | number };
}

interface CrmAccount {
  id: string;
  Account_Name?: string | null;
  Customer_Group?: string | null;
  Price_List?: string | null;
  CannaDevices_Shopify_ID?: string | null;
  Shopify_Market_ID?: string | null;
}

interface CrmContact {
  id: string;
  Email?: string | null;
}

/**
 * Fan a CRM account's tier (Customer_Group / Price_List) out to every store when
 * the field changes in Zoho CRM. Replaces the `Sync_BigCom_Customer_Group_to_Contacts`
 * Deluge function and additionally syncs the CannaDevices B2B (new Shopify) store.
 *
 * Triggered by a Deluge `invokeurl` on the account's webhook with `{ id }`.
 *
 * Steps:
 *   1. fetchData        — load the account + all its contacts from CRM
 *   2. syncContactsCrm  — mirror BigCommerce_Customer_Group onto the contacts
 *   3. syncBigCommerce  — set customer_group_id on the matching BigCommerce customers
 *   4. syncCannaDevices — move the account's company to the tier's Shopify market
 */
@Workflow({
  webhook: true,
  name: 'HBH - Sync Customer Group to stores',
  concurrency: 1,
})
export class SyncCustomerGroupToStoresWorkflow extends WorkflowBase<Payload> {
  constructor(
    private readonly bigCommerceService: BigCommerceService,
    private readonly shopify2Service: Shopify2Service,
    private readonly zohoService: ZohoService,
    private readonly mongo: MongoService,
  ) {
    super();
  }

  private logger = new Logger(SyncCustomerGroupToStoresWorkflow.name);

  // ---------------------------------------------------------------------------
  // Step 1 — load the account + all its contacts from CRM
  // ---------------------------------------------------------------------------
  @Step(1)
  async fetchData() {
    const accountId = String(
      this.payload?.id ?? this.payload?.account?.id ?? '',
    ).trim();
    if (!accountId) return this.cancel('Missing account id in payload');

    const { data } = await this.zohoService.get<{ data?: CrmAccount[] }>(
      `/crm/v8/Accounts/${accountId}`,
      {
        connection: ZOHO_CONNECTION,
        params: {
          fields:
            'Account_Name,Customer_Group,Price_List,CannaDevices_Shopify_ID,Shopify_Market_ID',
        },
      },
    );
    const account = data?.data?.[0];
    if (!account) return this.cancel(`Account ${accountId} not found`);

    // Fetch ALL related contacts via COQL (the Deluge only handled the first 50).
    const contacts: CrmContact[] = [];
    let lastId = '0';
    for (;;) {
      const { data: res } = await this.zohoService.post<{ data?: any[] }>(
        `/crm/v8/coql`,
        {
          select_query: `select id, Email from Contacts
                         where Account_Name.id = '${accountId}' and id > ${lastId}
                         order by id asc limit 200`,
        },
        { connection: ZOHO_CONNECTION },
      );
      const rows = res?.data ?? [];
      if (!rows.length) break;
      for (const r of rows) contacts.push({ id: String(r.id), Email: r.Email });
      lastId = String(rows[rows.length - 1].id);
      if (rows.length < 200) break;
    }

    this.logger.log(
      `Account ${accountId} (${account.Account_Name}) group="${account.Customer_Group}" — ${contacts.length} contacts`,
    );

    return { account: { ...account, id: accountId }, contacts };
  }

  // ---------------------------------------------------------------------------
  // Step 2 — mirror the group onto the account's contacts (BigCommerce_Customer_Group)
  // ---------------------------------------------------------------------------
  @Step(2)
  async syncContactsCrm() {
    const { account, contacts } = (await this.getResult<{
      account: CrmAccount;
      contacts: CrmContact[];
    }>('fetchData'))!;

    const group = account.Customer_Group?.trim() || null;
    if (!contacts.length) return { updated: 0 };

    // Zoho accepts up to 100 records per update call.
    let updated = 0;
    for (const batch of chunk(contacts, 100)) {
      const { data } = await this.zohoService.put<{ data?: any[] }>(
        `/crm/v8/Contacts`,
        {
          data: batch.map((c) => ({
            id: c.id,
            BigCommerce_Customer_Group: group,
          })),
        },
        { connection: ZOHO_CONNECTION },
      );
      updated += (data?.data ?? []).filter(
        (r: any) => r.code === 'SUCCESS',
      ).length;
    }

    this.logger.log(`Synced BigCommerce_Customer_Group to ${updated} contacts`);
    return { updated };
  }

  // ---------------------------------------------------------------------------
  // Step 3 — set customer_group_id on the matching BigCommerce customers
  // ---------------------------------------------------------------------------
  @Step(3)
  async syncBigCommerce() {
    const { account, contacts } = (await this.getResult<{
      account: CrmAccount;
      contacts: CrmContact[];
    }>('fetchData'))!;

    const group = account.Customer_Group?.trim() || null;
    const emails = contacts
      .map((c) => c.Email?.trim())
      .filter((e): e is string => !!e);
    if (!emails.length) return { updated: 0 };

    // Resolve the BigCommerce customer group id from the canonical Mongo mapping
    // (same source PushCrmContactToBigcommerceWorkflow uses). No match / "NA" =>
    // 0, which unassigns the customer's group.
    const groupDoc = group
      ? await this.mongo
          .db(BC_CONNECTION)
          .collection('customer_group')
          .findOne({ name: group })
      : null;
    const bcGroupId = groupDoc?.bigCommerceId
      ? Number(groupDoc.bigCommerceId)
      : 0;
    if (group && !groupDoc) {
      this.logger.warn(
        `No BigCommerce customer_group mapping for "${group}"; will unassign group`,
      );
    }

    // Look up BigCommerce customers by email (chunk email:in to keep the URL sane).
    const customerIds: number[] = [];
    for (const emailChunk of chunk(emails, 50)) {
      const {
        data: { data: customers },
      } = await this.bigCommerceService.get<{ data: { id: number }[] }>(
        '/v3/customers',
        {
          connection: BC_CONNECTION,
          params: { 'email:in': emailChunk.join(','), limit: 50 },
        },
      );
      for (const c of customers ?? []) customerIds.push(c.id);
    }

    if (!customerIds.length) return { updated: 0 };

    // Bulk-update in chunks of 10 (BigCommerce customers PUT accepts an array).
    let updated = 0;
    for (const idChunk of chunk(customerIds, 10)) {
      await this.bigCommerceService.put(
        '/v3/customers',
        idChunk.map((id) => ({ id, customer_group_id: bcGroupId })),
        { connection: BC_CONNECTION },
      );
      updated += idChunk.length;
    }

    this.logger.log(
      `Set customer_group_id=${bcGroupId} on ${updated} BigCommerce customers`,
    );
    return { updated, bcGroupId };
  }

  // ---------------------------------------------------------------------------
  // Step 4 — move the account's company to the tier's market on the new Shopify store
  // ---------------------------------------------------------------------------
  @Step(4)
  async syncCannaDevices() {
    const { account } = (await this.getResult<{ account: CrmAccount }>(
      'fetchData',
    ))!;

    // Resolve the company on the new store (by stored id, else crm_account_id).
    let companyGid: string | null = null;
    const storedId = account.CannaDevices_Shopify_ID?.toString().trim();

    if (!storedId) {
      if (!this.responseMetaSent) {
        await this.sendResponseMeta({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        await this.sendResponse(
          JSON.stringify({
            skipped: true,
            reason: 'no CannaDevices_Shopify_ID',
          }),
        );
      }

      this.exit(
        `Account ${account.id} has no CannaDevices_Shopify_ID; skipping market move`,
      );
    }

    if (storedId) {
      companyGid = storedId.startsWith('gid://')
        ? storedId
        : `gid://shopify/Company/${storedId}`;
      const found = await this.shopify2Service.gql<{ id: string } | null>({
        connection: 'canna-devices',
        root: 'company',
        variables: { id: companyGid },
        query: `#graphql
          query ($id: ID!) { company(id: $id) { id } }
        `,
      });
      companyGid = found?.id ?? null;
    }
    if (!companyGid) {
      const res = await this.shopify2Service.gql<{ nodes: { id: string }[] }>({
        connection: 'canna-devices',
        root: 'companies',
        variables: {
          query: `metafields.${MF_NAMESPACE}.${MF_KEY_CRM_ACCOUNT_ID}:'${escapeSearch(account.id)}'`,
        },
        query: `#graphql
          query ($query: String!) {
            companies(first: 1, query: $query) { nodes { id } }
          }
        `,
      });
      companyGid = res?.nodes?.[0]?.id ?? null;
    }

    // Not on the new store yet — nothing to move (PushCrmContactToShopify creates it).
    if (!companyGid) {
      this.logger.log(
        'Account has no CannaDevices company; skipping market move',
      );
      return { skipped: true };
    }

    // Resolve the target market from the tier (Teir/Tier tolerant). "Supported"
    // simply means a market exists for that tier — only the live markets qualify
    // (CannaDevices supports 3), so an unsupported/removed tier resolves to none.
    const key = tierKey(account.Price_List || account.Customer_Group);
    const market = key
      ? (await fetchMarketsByTierKey(this.shopify2Service))[key]
      : undefined;
    const newMarketNumId = market ? market.numericId : null;

    // Reconcile from the store's own state: each location's current market_id
    // metafield (plus the CRM-cached market), minus the target market.
    const locations = await fetchCompanyLocationsWithMarket(
      this.shopify2Service,
      companyGid,
    );
    if (!locations.length) return { skipped: true, reason: 'no locations' };
    const locationGids = locations.map((l) => l.id);

    const currentMarkets = new Set<string>(
      locations.map((l) => l.marketId).filter((m): m is string => !!m),
    );
    const cachedMarket = account.Shopify_Market_ID?.toString().trim();
    if (cachedMarket) currentMarkets.add(cachedMarket);
    if (newMarketNumId) currentMarkets.delete(newMarketNumId);

    // Already correct (assigned to the target market only) — nothing to do.
    if (
      newMarketNumId &&
      currentMarkets.size === 0 &&
      locations.every((l) => l.marketId === newMarketNumId)
    ) {
      this.logger.log('Market membership already correct; nothing to do');
      return { unchanged: true, marketId: newMarketNumId };
    }

    // Remove the locations from every non-target market it is assigned to (a tier
    // change, or an unsupported tier). Only touches markets it is actually in.
    for (const stale of currentMarkets) {
      await marketRemoveCompanyLocations(
        this.shopify2Service,
        `gid://shopify/Market/${stale}`,
        locationGids,
      );
    }

    if (market && newMarketNumId) {
      // Supported tier: (re)tag the market_id metafield and add to the market.
      await setMetafields(
        this.shopify2Service,
        locationGids.map((ownerId) => ({
          ownerId,
          namespace: MF_NAMESPACE,
          key: MF_KEY_MARKET_ID,
          type: 'single_line_text_field',
          value: newMarketNumId,
        })),
      );
      await marketUpdateCompanyLocations(
        this.shopify2Service,
        market.id,
        locationGids,
      );
    } else if (currentMarkets.size) {
      // Unsupported tier: it belongs to no CannaDevices market. Clear the stale
      // market_id tag so nothing re-adds it. Customer_Group / Price_List are left
      // untouched — BigCommerce depends on them and supports all tiers.
      await deleteMetafields(
        this.shopify2Service,
        locationGids.map((ownerId) => ({
          ownerId,
          namespace: MF_NAMESPACE,
          key: MF_KEY_MARKET_ID,
        })),
      );
    }

    // Sync only the Shopify market pointer on the CRM account (null when the
    // company was removed from the market). Never touches Customer_Group / Price_List.
    try {
      await this.zohoService.put(
        `/crm/v8/Accounts/${account.id}`,
        { data: [{ id: account.id, Shopify_Market_ID: newMarketNumId }] },
        { connection: ZOHO_CONNECTION },
      );
    } catch (e: any) {
      this.logger.error(
        `CRM Shopify_Market_ID write failed for ${account.id}: ${e?.message ?? e}`,
      );
    }

    const removedFrom = [...currentMarkets];
    this.logger.log(
      newMarketNumId
        ? `Company ${gidNumericId(companyGid)} -> market ${newMarketNumId} (removed from ${removedFrom.join(', ') || 'none'})`
        : `Company ${gidNumericId(companyGid)} removed from markets ${removedFrom.join(', ') || 'none'}; tier "${account.Price_List || account.Customer_Group}" is not supported by CannaDevices`,
    );

    if (!this.responseMetaSent) {
      await this.sendResponseMeta({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      await this.sendResponse(
        JSON.stringify({
          success: true,
          marketId: newMarketNumId,
          removedFrom,
        }),
      );
    }

    return {
      companyId: gidNumericId(companyGid),
      newMarketId: newMarketNumId,
      removedFrom,
      locations: locationGids.length,
    };
  }
}
