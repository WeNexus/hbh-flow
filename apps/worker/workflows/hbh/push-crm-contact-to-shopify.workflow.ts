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
  fetchCompanyLocationIds,
  gidNumericId,
  setMetafields,
  syncMarketCompanyLocations,
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

    let customer;
    let company;
    let market;

    if (!customerId) {
      const customers = await this.shopify2Service.gql({
        query: `#graphql
        query {
          customers(first: 1, query: "email:${contact.Email} OR metafields.custom.crm_contact_id:'${contact.id}'") {
            nodes {
              id
              companyContactProfiles {
                company {
                  id
                  name

                  locations(first: 100) {
                    nodes {
                      id
                    }
                  }
                }
              }
            }
          }
        }
        `,
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
            companyContactProfiles {
              company {
                id
                name
                
                locations(first: 100) {
                  nodes {
                    id
                  }
                }
              }
            }
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

    const associatedCompany = customer?.companyContactProfiles?.find(
      (p) => p.company.name === account.Account_Name,
    );

    if (associatedCompany) {
      company = associatedCompany.company;
    } else if (!companyId) {
      const companies = await this.shopify2Service.gql({
        query: `#graphql
        query {
          companies(first: 1, query: "name:${account.Account_Name} OR metafields.custom.crm_account_id:'${account.id}'") {
            nodes {
              id
              
              locations(first: 100) {
                nodes {
                  id
                }
              }
            }
          }
        }
        `,
        connection: 'canna-devices',
        root: 'companies',
      });

      company = companies.nodes[0];
    } else {
      if (companyId.startsWith('gid://shopify/Company')) {
        companyId = companyId.split('/').pop();
      }

      company = await this.shopify2Service.gql({
        query: `#graphql
        query ($id: ID!) {
          company(id: $id) {
            id
            
            locations(first: 100) {
              nodes {
                id
              }
            }
          }
        }
        `,
        variables: {
          id: `gid://shopify/Company/${companyId}`,
        },
        connection: 'canna-devices',
        root: 'company',
      });
    }

    const priceList = (account.Price_List || account.Customer_Group)
      ?.trim()
      .replace('Teir', 'Tier');

    this.logger.log(priceList);

    if (
      priceList &&
      priceList !== 'NA' &&
      priceList !== 'N/A' &&
      priceList !== 'None'
    ) {
      const markets = await this.shopify2Service.gql({
        query: `#graphql
        query {
          markets(first: 1, query: "name:'${priceList}'") {
            nodes {
              id
            }
          }
        }
        `,
        connection: 'canna-devices',
        root: 'markets',
      });

      market = markets.nodes[0];
    }

    return {
      account,
      contact,
      company,
      customer,
      market,
      companyAssociated: !!associatedCompany,
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
    } else {
      // TODO: Update company if needed
    }

    const companyId = (companyResult?.company?.id ?? company.id)
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

    const marketsToSync: MarketSync[] = [];
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
        // The actual rebuild (bulk query + marketUpdate) is deferred to the
        // next step so the webhook caller isn't blocked on it.
        marketsToSync.push({
          id: market.id,
          numericId: newMarketId,
          mode: 'add',
          companyLocationIds: locationGids,
        });
      }
    }

    // Keep the CRM's cached Shopify ids / market in sync regardless.
    const marketChanged = (lastMarketId || '') !== (newMarketId || '');
    if (!account.CannaDevices_Shopify_ID || marketChanged) {
      await this.zohoService.put(
        `/crm/v8/Accounts/${account.id}`,
        {
          data: [
            {
              id: account.id,
              CannaDevices_Shopify_ID: companyId,
              Shopify_Market_ID: market?.id.split('/').pop() || null,
            },
          ],
        },
        {
          connection: 'hbh',
        },
      );
    }

    if (!contact.CannaDevices_Shopify_ID) {
      await this.zohoService.put(
        `/crm/v8/Contacts/${contact.id}`,
        {
          data: [
            {
              id: contact.id,
              CannaDevices_Shopify_ID: customerId,
            },
          ],
        },
        {
          connection: 'hbh',
        },
      );
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
      marketsToSync,
    };
  }

  @Step(3)
  async syncMarkets() {
    const data = await this.getResult<{ marketsToSync?: MarketSync[] }>(
      'createCustomer',
    );
    const marketsToSync = data?.marketsToSync ?? [];

    const results: Record<string, any>[] = [];
    for (const m of marketsToSync) {
      const result = await syncMarketCompanyLocations(
        this.shopify2Service,
        { id: m.id, numericId: m.numericId },
        m.mode === 'add'
          ? { include: m.companyLocationIds }
          : { exclude: m.companyLocationIds },
      );
      this.logger.log(
        `Market ${m.numericId} (${m.mode}): ${result.skipped ? 'skipped (empty)' : `${result.count} locations`}`,
      );
      results.push({ market: m.numericId, mode: m.mode, ...result });
    }
    return results;
  }
}

interface MarketSync {
  id: string;
  numericId: string;
  mode: 'add' | 'remove';
  companyLocationIds: string[];
}
