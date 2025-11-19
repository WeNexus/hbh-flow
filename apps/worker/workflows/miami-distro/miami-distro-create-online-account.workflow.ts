import { WoocommerceService } from '#lib/woocommerce/woocommerce.service';
import { WooCommerceApiError } from 'woocommerce-rest-ts-api';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import { Logger } from '@nestjs/common';

@Workflow({
  name: 'Miami Distro - Create Online Account',
  webhook: true,
  concurrency: 10,
})
export class MiamiDistroCreateOnlineAccountWorkflow extends WorkflowBase {
  constructor(
    private readonly wooCommerceService: WoocommerceService,
    private readonly zohoService: ZohoService,
    private readonly envService: EnvService,
  ) {
    super();
  }

  private logger = new Logger(MiamiDistroCreateOnlineAccountWorkflow.name);

  async getWooCustomer(contact) {
    const client = this.wooCommerceService.getClient('miami_distro');

    const { data } = await client.getCustomers({
      email: contact.Website_Login_ID || contact.Email,
    });

    return data[0];
  }

  @Step(1)
  async execute() {
    const event = this.payload;
    const contact = JSON.parse(event.contact);
    const account = JSON.parse(event.account);
    const customer = await this.getWooCustomer(contact);

    let result: any;

    const client = this.wooCommerceService.getClient('miami_distro');

    const contactEmail = contact.Email;
    const accountEmail = account.Email_1;

    const phone =
      account.Phone || contact.Phone || contact.Other_Phone || contact.Mobile;

    try {
      if (!customer) {
        const password = `${contactEmail}+${this.envService.getString('MIAMI_DISTRO_WC_DEFAULT_PASSWORD')}`;

        const { data } = await client.post('customers', {
          first_name: contact.First_Name,
          last_name: contact.Last_Name,
          email: contactEmail,
          billing: {
            first_name: contact.First_Name,
            last_name: contact.Last_Name,
            company: account.Account_Name,
            address_1: account.Billing_Street,
            city: account.Billing_City,
            state: account.Billing_State,
            postcode: account.Billing_Code,
            country: account.Billing_Country,
            email: accountEmail || contactEmail,
            phone,
          },
          shipping: {
            first_name: contact.First_Name,
            last_name: contact.Last_Name,
            company: account.Account_Name,
            address_1: account.Shipping_Street,
            city: account.Shipping_City,
            state: account.Shipping_State,
            postcode: account.Shipping_Code,
            country: account.Shipping_Country,
          },
          password,
        });

        await this.zohoService.post(
          `/crm/v8/Contacts/${contact.id}/Notes`,
          {
            data: [
              {
                Parent_Id: {
                  id: contact.id,
                  module: {
                    api_name: 'Contacts',
                  },
                },
                Note_Content: `First time login password for website: <b>${password}</b>`,
              },
            ],
          },
          {
            connection: 'miami_distro',
          },
        );

        result = data;
      } else {
        const { data } = await client.put(`customers/${customer.id}`, {
          first_name: contact.First_Name,
          last_name: contact.Last_Name,
          email: customer.email === contactEmail ? undefined : contactEmail,
          billing: {
            first_name: contact.First_Name,
            last_name: contact.Last_Name,
            company: account.Account_Name,
            address_1: account.Billing_Street,
            city: account.Billing_City,
            state: account.Billing_State,
            postcode: account.Billing_Code,
            country: account.Billing_Country,
            email: accountEmail || contactEmail,
            phone,
          },
          shipping: {
            first_name: contact.First_Name,
            last_name: contact.Last_Name,
            company: account.Account_Name,
            address_1: account.Shipping_Street,
            city: account.Shipping_City,
            state: account.Shipping_State,
            postcode: account.Shipping_Code,
            country: account.Shipping_Country,
          },
        });

        result = data;
      }
    } catch (e) {
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
            success: e.statusCode === 500,
            hasAccount: !!customer,
            message: `There was an error creating the contact in the website: ${e.message}`,
          }),
        );
      }

      if (e instanceof WooCommerceApiError) {
        this.logger.error(e.response?.data);
      }

      throw e;
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

    return result;
  }
}
