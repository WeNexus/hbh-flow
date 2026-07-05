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
  escapeSearch,
  fetchCompanyLocationIds,
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

    // Resolve the target market from the tier (Teir/Tier tolerant).
    const key = tierKey(account.Price_List || account.Customer_Group);
    const market = key
      ? (await fetchMarketsByTierKey(this.shopify2Service))[key]
      : undefined;
    const newMarketNumId = market ? market.numericId : null;
    const oldMarketNumId = account.Shopify_Market_ID?.toString().trim() || null;

    if (newMarketNumId && oldMarketNumId === newMarketNumId) {
      this.logger.log('Market unchanged; nothing to move');
      return { unchanged: true, marketId: newMarketNumId };
    }

    const locationGids = await fetchCompanyLocationIds(
      this.shopify2Service,
      companyGid,
    );
    if (!locationGids.length) return { skipped: true, reason: 'no locations' };

    // Re-tag the market_id metafield and add the locations to the new market.
    if (market && newMarketNumId) {
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
    }

    // Remove the locations from the previous market (tier changed).
    if (oldMarketNumId && oldMarketNumId !== newMarketNumId) {
      await marketRemoveCompanyLocations(
        this.shopify2Service,
        `gid://shopify/Market/${oldMarketNumId}`,
        locationGids,
      );
    }

    // Persist the new market on the CRM account (best-effort).
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

    this.logger.log(
      `Moved company ${gidNumericId(companyGid)} to market ${newMarketNumId ?? '(none)'} (from ${oldMarketNumId ?? '(none)'})`,
    );

    if (!this.responseMetaSent) {
      await this.sendResponseMeta({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      await this.sendResponse(
        JSON.stringify({ success: true, marketId: newMarketNumId }),
      );
    }

    return {
      companyId: gidNumericId(companyGid),
      newMarketId: newMarketNumId,
      oldMarketId: oldMarketNumId,
      locations: locationGids.length,
    };
  }
}
