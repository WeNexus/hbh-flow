import { Shopify2Service } from '#lib/shopify/shopify2.service';
import { ShopifyService } from '#lib/shopify/shopify.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { Logger } from '@nestjs/common';
import {
  MF_KEY_CRM_ACCOUNT_ID,
  MF_KEY_CRM_CONTACT_ID,
  MF_KEY_MARKET_ID,
  MF_NAMESPACE,
  escapeSearch,
  fetchCompanyLocationIds,
  fetchMarketsByTierKey,
  gidNumericId,
  marketUpdateCompanyLocations,
  setMetafields,
  tierKey,
} from './cannadevices-b2b.util';

@Workflow({
  webhook: true,
  name: 'HBH - Push CRM Contact to CannaDevices (Shopify)',
  concurrency: 1,
})
export class PushCrmContactToShopifyWorkflow extends WorkflowBase {
  constructor(
    private readonly shopify2Service: Shopify2Service,
    private readonly shopifyService: ShopifyService,
    private readonly zohoService: ZohoService,
  ) {
    super();
  }

  private logger = new Logger(PushCrmContactToShopifyWorkflow.name);

  @Step(1)
  async fetchData() {
    const event = this.payload;

    const account =
      typeof event.account === 'string'
        ? JSON.parse(event.account)
        : event.account;
    const contact =
      typeof event.contact === 'string'
        ? JSON.parse(event.contact)
        : event.contact;

    let customerId = contact.CannaDevices_Shopify_ID?.toString().trim();
    let companyId = account.CannaDevices_Shopify_ID?.toString().trim();

    let customer: any;
    let company: any;
    let market: any;

    // --- Resolve the customer (by stored id, else crm_contact_id / email) ---
    if (!customerId) {
      const customers = await this.shopify2Service.gql({
        query: `#graphql
        query ($query: String!) {
          customers(first: 1, query: $query) {
            nodes { id companyContactProfiles { company { id } } }
          }
        }
        `,
        variables: {
          query: `email:'${escapeSearch(contact.Email)}' OR metafields.custom.crm_contact_id:'${escapeSearch(contact.id)}'`,
        },
        connection: 'canna-devices',
        root: 'customers',
      });

      customer = customers.nodes[0];
    } else {
      if (customerId.startsWith('gid://shopify/Customer')) {
        customerId = customerId.split('/').pop();
      }

      customer = await this.shopify2Service.gql({
        query: `#graphql
        query ($id: ID!) {
          customer(id: $id) {
            id
            companyContactProfiles { company { id } }
          }
        }
        `,
        variables: {
          id: `gid://shopify/Customer/${customerId}`,
        },
        connection: 'canna-devices',
        root: 'customer',
      });
    }

    // --- Resolve the company by RELIABLE keys ONLY (never fuzzy name) ---
    // A CRM account maps 1:1 to a Shopify company via externalId = account.id
    // and the custom.crm_account_id metafield. Matching by name previously
    // linked several accounts to one company, which then wrote a duplicate
    // CannaDevices_Shopify_ID back to CRM (a unique field) and failed.
    if (companyId) {
      if (companyId.startsWith('gid://shopify/Company')) {
        companyId = companyId.split('/').pop();
      }
      company = await this.shopify2Service.gql({
        query: `#graphql
        query ($id: ID!) { company(id: $id) { id } }
        `,
        variables: { id: `gid://shopify/Company/${companyId}` },
        connection: 'canna-devices',
        root: 'company',
      });
    } else {
      const companies = await this.shopify2Service.gql({
        query: `#graphql
        query ($query: String!) {
          companies(first: 1, query: $query) { nodes { id } }
        }
        `,
        variables: {
          query: `metafields.custom.crm_account_id:'${escapeSearch(account.id)}'`,
        },
        connection: 'canna-devices',
        root: 'companies',
      });
      company = companies.nodes[0];
    }

    // Is the customer already a contact of THIS company (by id, not name)?
    const companyAssociated = !!(
      company &&
      customer?.companyContactProfiles?.some(
        (p: any) => p.company.id === company.id,
      )
    );

    // Match the CRM tier to a Shopify market by a canonical key that tolerates
    // the "Teir"/"Tier" typo (present in CRM data) and casing.
    const key = tierKey(account.Price_List || account.Customer_Group);
    this.logger.log(
      `tier "${account.Price_List || account.Customer_Group}" -> key "${key}"`,
    );

    if (key) {
      const marketsByKey = await fetchMarketsByTierKey(this.shopify2Service);
      market = marketsByKey[key];
      if (!market) {
        this.logger.warn(`No Shopify market matches tier key "${key}"`);
      }
    }

    return {
      account,
      contact,
      company,
      customer,
      market,
      companyAssociated,
    };
  }

  @Step(2)
  async createCustomer() {
    const { account, contact, customer, company, market, companyAssociated } =
      await this.getResult('fetchData');

    let contactAssignmentResult: Record<string, any> | undefined = undefined;
    let customerResult: Record<string, any> | undefined = undefined;
    let companyResult: Record<string, any> | undefined = undefined;

    if (!company) {
      const mutation = `#graphql
      mutation ($input: CompanyCreateInput!) {
        companyCreate(input: $input) {
          company {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
      `;

      companyResult = await this.shopify2Service.gql({
        query: mutation,
        connection: 'canna-devices',
        root: 'companyCreate',
        variables: {
          input: {
            company: {
              name: account.Account_Name,
              externalId: account.id,
            },
          },
        },
      });

      // Idempotency: a company with this externalId may already exist (a prior
      // run created it) -> Shopify returns "External id has already been taken".
      // Recover the existing company by its crm_account_id metafield.
      if (!companyResult?.company?.id) {
        const message = (companyResult?.userErrors ?? [])
          .map((e: any) => e.message)
          .join(', ');
        const existing = await this.shopify2Service.gql({
          query: `#graphql
          query ($query: String!) {
            companies(first: 1, query: $query) { nodes { id } }
          }
          `,
          variables: {
            query: `metafields.custom.crm_account_id:'${escapeSearch(account.id)}'`,
          },
          connection: 'canna-devices',
          root: 'companies',
        });
        if (existing?.nodes?.[0]?.id) {
          companyResult = { company: existing.nodes[0] };
        } else {
          throw new Error(
            `companyCreate failed for account ${account.id}: ${message}`,
          );
        }
      }
    } else {
      // TODO: Update company if needed
    }

    const companyId = (companyResult?.company?.id ?? company?.id)
      .split('/')
      .pop();

    if (!customer) {
      const mutation = `#graphql
      mutation ($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
      `;

      customerResult = await this.shopify2Service.gql({
        query: mutation,
        connection: 'canna-devices',
        root: 'customerCreate',
        variables: {
          input: {
            firstName: `${contact.First_Name}`,
            lastName: `${contact.Last_Name}`,
            email: `${contact.Email}`,
            note: `Company: ${account.Account_Name}`,
          },
        },
      });
    } else {
      // TODO: Update customer if needed
    }

    const customerId = (customerResult?.customer?.id ?? customer.id)
      .split('/')
      .pop();

    if (!companyAssociated) {
      const mutation = `#graphql
      mutation ($companyId: ID!, $customerId: ID!) {
        companyAssignCustomerAsContact(companyId: $companyId, customerId: $customerId) {
          companyContact {
            id
            customer {
              id
            }
          }
          userErrors {
            field
            message
          }
        }
      }
      `;

      contactAssignmentResult = await this.shopify2Service.gql({
        query: mutation,
        connection: 'canna-devices',
        root: 'companyAssignCustomerAsContact',
        variables: {
          companyId: `gid://shopify/Company/${companyId}`,
          customerId: `gid://shopify/Customer/${customerId}`,
        },
      });
    }

    // --- CRM id metafields (used for future lookups + market membership) ---
    const companyGid = `gid://shopify/Company/${companyId}`;
    const customerGid = `gid://shopify/Customer/${customerId}`;

    await setMetafields(this.shopify2Service, [
      {
        ownerId: companyGid,
        namespace: MF_NAMESPACE,
        key: MF_KEY_CRM_ACCOUNT_ID,
        type: 'single_line_text_field',
        value: String(account.id),
      },
      {
        ownerId: customerGid,
        namespace: MF_NAMESPACE,
        key: MF_KEY_CRM_CONTACT_ID,
        type: 'single_line_text_field',
        value: String(contact.id),
      },
    ]);

    // --- Market conditions ---
    // Only (re)build market conditions when the company was newly created in
    // this run. An existing company is assumed to already be a member of its
    // market, and rebuilding conditions (a bulk query over every company
    // location in the market) is the slow part we want to avoid on re-syncs.
    const companyCreated = !company;
    const lastMarketId = account.Shopify_Market_ID?.toString().trim();
    const newMarketId = market ? gidNumericId(market.id) : null;

    let marketToSync: MarketSync | null = null;
    if (companyCreated && market && newMarketId) {
      const locationGids = await fetchCompanyLocationIds(
        this.shopify2Service,
        companyGid,
      );
      if (locationGids.length) {
        // Tag the new company's locations so the market query includes them.
        await setMetafields(
          this.shopify2Service,
          locationGids.map((ownerId) => ({
            ownerId,
            namespace: MF_NAMESPACE,
            key: MF_KEY_MARKET_ID,
            type: 'single_line_text_field',
            value: newMarketId,
          })),
        );
        // The actual market rebuild (bulk query + marketUpdate) runs in the
        // following steps so the webhook caller isn't blocked on it.
        marketToSync = {
          marketId: market.id,
          numericId: newMarketId,
          companyLocationIds: locationGids,
        };
      }
    }

    // Keep the CRM's cached Shopify ids / market in sync regardless. The Shopify
    // work above already succeeded, so a CRM write failure must not fail the
    // whole webhook (it would just be retried and is idempotent) — log and move on.
    const marketChanged = (lastMarketId || '') !== (newMarketId || '');
    if (!account.CannaDevices_Shopify_ID || marketChanged) {
      try {
        await this.zohoService.put(
          `/crm/v8/Accounts/${account.id}`,
          {
            data: [
              {
                id: account.id,
                CannaDevices_Shopify_ID: companyId,
                Shopify_Market_ID: gidNumericId(market?.id) || null,
              },
            ],
          },
          { connection: 'hbh' },
        );
      } catch (e: any) {
        this.logger.error(
          `CRM Account ${account.id} write failed: ${e?.message ?? e}`,
        );
      }
    }

    if (!contact.CannaDevices_Shopify_ID) {
      try {
        await this.zohoService.put(
          `/crm/v8/Contacts/${contact.id}`,
          {
            data: [{ id: contact.id, CannaDevices_Shopify_ID: customerId }],
          },
          { connection: 'hbh' },
        );
      } catch (e: any) {
        this.logger.error(
          `CRM Contact ${contact.id} write failed: ${e?.message ?? e}`,
        );
      }
    }

    if (!this.responseMetaSent) {
      await this.sendResponseMeta({
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          'X-Has-Account': customer ? 'true' : 'false',
        },
      });

      await this.sendResponse(
        JSON.stringify({
          success: true,
          message: customer
            ? `The contact has been re-synced with the website successfully.`
            : `The contact has been created in the website successfully.`,
        }),
      );
    }

    return {
      companyResult,
      customerResult,
      contactAssignmentResult,
      marketToSync,
    };
  }

  // Step 3 — add the new company's locations to its market's condition.
  //
  // `marketUpdate`'s `conditionsToAdd` APPENDS to the market's existing member
  // set (it does not replace), so we only send this company's location ids — no
  // need to bulk-export and re-send the whole market. This runs after the
  // webhook response is streamed in step 2, so the caller isn't blocked on it.
  @Step(3)
  async applyMarketConditions() {
    const m = (
      await this.getResult<{ marketToSync?: MarketSync | null }>(
        'createCustomer',
      )
    )?.marketToSync;
    if (!m) return { skipped: true };

    const result = await marketUpdateCompanyLocations(
      this.shopify2Service,
      m.marketId,
      m.companyLocationIds,
    );
    this.logger.log(`Market ${m.numericId}: added ${result.count} locations`);
    return result;
  }
}

interface MarketSync {
  marketId: string;
  numericId: string;
  companyLocationIds: string[];
}
