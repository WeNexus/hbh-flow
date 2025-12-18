import { ShopifyService } from '#lib/shopify/shopify.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';

@Workflow({
  webhook: true,
  name: 'HBH - Push CRM Contact to CannaDevices (Shopify)',
})
export class PushCrmContactToShopifyWorkflow extends WorkflowBase {
  constructor(
    private readonly shopifyService: ShopifyService,
    private readonly zohoService: ZohoService,
  ) {
    super();
  }

  @Step(1)
  async fetchData() {
    const event = this.payload;

    const contact =
      typeof event.contact === 'string'
        ? JSON.parse(event.contact)
        : event.contact;

    const id = contact.CannaDevices_Shopify_ID;

    let customer;

    if (!id) {
      const customers = await this.shopifyService.gql({
        query: `#graphql
        query {
          customers(first: 1, query: "email:${contact.Email}") {
            edges {
              node {
                id
              }
            }
          }
        }
        `,
        connection: 'cannadevices',
        root: 'customers',
      });

      customer = customers.edges[0]?.node;
    } else {
      customer = await this.shopifyService.gql({
        query: `#graphql
    query ($id: ID!) {
      customer(id: $id) {
        id
      }
    }
    `,
        variables: {
          id: `gid://shopify/Customer/${id}`,
        },
        connection: 'cannadevices',
        root: 'customer',
      });
    }

    return {
      account:
        typeof event.account === 'string'
          ? JSON.parse(event.account)
          : event.account,
      customer,
      contact,
    };
  }

  @Step(2)
  async createCustomer() {
    const { account, contact, customer } = await this.getResult('fetchData');

    let customerResult: Record<string, any>;

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
        connection: 'cannadevices',
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

    if (!contact.CannaDevices_Shopify_ID) {
      await this.zohoService.put(
        `/crm/v8/Contacts/${contact.id}`,
        {
          data: {
            CannaDevices_Shopify_ID: customerResult.customer.id
              .split('/')
              .pop(),
          },
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

    return customerResult;
  }
}
