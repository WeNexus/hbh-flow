import { Shopify2Service } from '#lib/shopify/shopify2.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';

@Workflow({
  webhook: true,
  name: 'HBH - Push CRM Contact to CannaDevices (Shopify)',
})
export class PushCrmContactToShopifyWorkflow extends WorkflowBase {
  constructor(
    private readonly shopifyService: Shopify2Service,
    private readonly zohoService: ZohoService,
  ) {
    super();
  }

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

    if (!customerId) {
      const customers = await this.shopifyService.gql({
        query: `#graphql
        query {
          customers(first: 1, query: "email:${contact.Email}") {
            edges {
              node {
                id
                companyContactProfiles {
                  company {
                    id
                    name
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

      customer = customers.edges[0]?.node;
    } else {
      if (customerId.startsWith('gid://shopify/Customer')) {
        customerId = customerId.split('/').pop();
      }

      customer = await this.shopifyService.gql({
        query: `#graphql
        query ($id: ID!) {
          customer(id: $id) {
            id
            companyContactProfiles {
              company {
                id
                name
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
      (p) => p.company.name === account.Account_Name.name,
    );

    if (associatedCompany) {
      company = associatedCompany.company;
    } else if (!companyId) {
      const companies = await this.shopifyService.gql({
        query: `#graphql
        query {
          companies(first: 1, query: "name:${account.Account_Name.name}") {
            edges {
              node {
                id
              }
            }
          }
        }
        `,
        connection: 'canna-devices',
        root: 'companies',
      });

      company = companies.edges[0]?.node;
    } else {
      if (companyId.startsWith('gid://shopify/Company')) {
        companyId = companyId.split('/').pop();
      }

      company = await this.shopifyService.gql({
        query: `#graphql
        query ($id: ID!) {
          company(id: $id) {
            id
          }
        }
        `,
        variables: {
          id: `gid://shopify/Customer/${companyId}`,
        },
        connection: 'canna-devices',
        root: 'company',
      });
    }

    return {
      account,
      contact,
      company,
      customer,
      companyAssociated: !!associatedCompany,
    };
  }

  @Step(2)
  async createCustomer() {
    const { account, contact, customer, company, companyAssociated } =
      await this.getResult('fetchData');

    let associationResult: Record<string, any>;
    let customerResult: Record<string, any>;
    let companyResult: Record<string, any>;

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

      companyResult = await this.shopifyService.gql({
        query: mutation,
        connection: 'canna-devices',
        root: 'companyCreate',
        variables: {
          input: {
            company: {
              name: account.Account_Name.name,
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
    const customerId = (customerResult?.customer?.id ?? customer.id)
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

      customerResult = await this.shopifyService.gql({
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

      associationResult = await this.shopifyService.gql({
        query: mutation,
        connection: 'canna-devices',
        root: 'companyAssignCustomerAsContact',
        variables: {
          companyId: `gid://shopify/Company/${companyId}`,
          customerId: `gid://shopify/Customer/${customerId}`,
        },
      });
    }

    if (!account.CannaDevices_Shopify_ID) {
      await this.zohoService.put(
        `/crm/v8/Accounts/${account.id}`,
        {
          data: [
            {
              id: account.id,
              CannaDevices_Shopify_ID: companyId,
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

    return [companyResult, customerResult, associationResult];
  }
}
