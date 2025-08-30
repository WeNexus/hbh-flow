import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { FlodeskService } from '#lib/flodesk/flodesk.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import { ModuleRef } from '@nestjs/core';
import mongodb from 'mongodb';

const MongoClient = mongodb.MongoClient;

@Workflow({ webhook: true })
export class PushCrmContactToBigcommerceWorkflow extends WorkflowBase {
  constructor(
    private readonly bigCommerceService: BigCommerceService,
    private readonly flodeskService: FlodeskService,
    private readonly envService: EnvService,
    moduleRef: ModuleRef,
  ) {
    super(moduleRef);
  }

  async getFlodeskSegments() {
    let page = 1;

    const flodeskSegments = [];

    while (true) {
      const response = await this.flodeskService.get('/segments', {
        connection: 'default',
        params: {
          per_page: 100,
          page: page++,
        },
      });

      flodeskSegments.push(...response.data);

      if (page >= response.meta.total_pages) {
        break;
      }
    }

    return flodeskSegments;
  }
  async getBigCommerceCustomers(contact) {
    const channels = ['hbh', 'dispomart'];
    const customers = [];

    for (const channel of channels) {
      const { data } = await this.bigCommerceService.get('/v3/customers', {
        connection: channel,
        params: {
          'email:in': contact.Email || contact.Wholesale_Site_Login_ID,
        },
      });

      customers.push({
        customer: data[0],
        channel,
      });
    }

    return customers;
  }
  async upsertMetafield(channel: string, customerId: string, contact, account) {
    try {
      await this.bigCommerceService.post(
        `/v3/customers/${customerId}/metafields`,
        {
          namespace: 'Sales',
          key: 'Sales Person',
          value: JSON.stringify(contact.Owner),
          permission_set: 'read_and_sf_access',
        },
        {
          connection: channel,
        },
      );
    } catch {
      const { data: metafields } = await this.bigCommerceService.get(
        `/v3/customers/${customerId}/metafields`,
        {
          connection: channel,
        },
      );

      const metafield = metafields.find(
        (m) => m.namespace === 'Sales' && m.key === 'Sales Person',
      );

      await this.bigCommerceService.put(
        `/v3/customers/${customerId}/metafields/${metafield.id}`,
        {
          value: JSON.stringify(contact.Owner),
        },
        {
          connection: channel,
        },
      );
    }

    try {
      await this.bigCommerceService.post(
        `/v3/customers/${customerId}/metafields`,
        {
          namespace: 'Sales',
          key: 'Customer Number',
          value: JSON.stringify(account.Customer_Number || 'N/A'),
          permission_set: 'read_and_sf_access',
        },
        {
          connection: channel,
        },
      );
    } catch {
      const { data: metafields } = await this.bigCommerceService.get(
        `/v3/customers/${customerId}/metafields`,
        {
          connection: channel,
        },
      );

      const metafield = metafields.find(
        (m) => m.namespace === 'Sales' && m.key === 'Customer Number',
      );

      await this.bigCommerceService.put(
        `/v3/customers/${customerId}/metafields/${metafield.id}`,
        {
          value: JSON.stringify(account.Customer_Number || 'N/A'),
        },
        {
          connection: channel,
        },
      );
    }
  }
  getMongoAuth() {
    return {
      username: this.envService.getString('MONGO_USERNAME'),
      password: this.envService.getString('MONGO_PASSWORD'),
      hostname: this.envService.getString('MONGO_HOST'),
      database: this.envService.getString('MONGO_DB'),
    };
  }

  @Step(1)
  async fetchData() {
    const mongoAuth = this.getMongoAuth();
    const event = this.payload;

    const contact = JSON.parse(event.contact);
    const customers = await this.getBigCommerceCustomers(contact);

    const client = await MongoClient.connect(
      `mongodb+srv://${mongoAuth.username}:${mongoAuth.password}@${mongoAuth.hostname}/${mongoAuth.database}?retryWrites=true&w=majority`,
    );

    for (const customer of customers) {
      customer.groups = await client
        .db(customer.channel)
        .collection('customer_group')
        .find({})
        .toArray();
    }

    await client.close();

    return {
      flodeskSegments: await this.getFlodeskSegments(),
      account: JSON.parse(event.account),
      customers,
      contact,
    };
  }

  @Step(2)
  async createCustomer() {
    const { account, contact, customers, flodeskSegments } =
      await this.getResult('fetchData');

    const enableHbh =
      contact.Wholesale_Channels.includes('HBH Wholesale') ||
      contact.Wholesale_Channels.length === 0;
    const enableDispomart = contact.Wholesale_Channels.includes('Dispomart');
    const hasAccount = customers.some((i) => i.customer);
    const group = account.Customer_Group.trim();

    const customerResults = [];
    const metafieldResults = [];

    for (const customer of customers) {
      const shouldEnable =
        customer.channel === 'hbh' ? enableHbh : enableDispomart;

      const _group = customer.groups.find(
        (g) => g.name.trim() === group.trim(),
      );

      let customerResult;
      let metafieldResult;

      if (!shouldEnable) {
        continue;
      }

      if (!customer.customer) {
        customerResult = await this.bigCommerceService.post(
          '/v3/customers',
          [
            {
              first_name: contact.First_Name,
              last_name: contact.Last_Name,
              email: contact.Email,
              phone: contact.Phone || contact.Cell_Phone || undefined,
              mobile: contact.Mobile || contact.Secondary_Mobile || undefined,
              company: account.Account_Name,
              customer_group_id: _group?.bigCommerceId
                ? Number(_group.bigCommerceId)
                : undefined,
              accepts_product_review_abandoned_cart_emails: true,
              authentication: {
                force_password_reset: false,
              },
            },
          ],
          {
            connection: customer.channel,
          },
        );

        metafieldResult = await this.upsertMetafield(
          customer.channel,
          customerResult.data[0].id,
          contact,
          account,
        );
      } else {
        customerResult = await this.bigCommerceService.put(
          '/v3/customers',
          [
            {
              id: customer.customer.id,
              first_name: contact.First_Name,
              last_name: contact.Last_Name,
              email: contact.Email,
              phone: contact.Phone || contact.Cell_Phone || undefined,
              mobile: contact.Mobile || contact.Secondary_Mobile || undefined,
              company: account.Account_Name,
              customer_group_id: _group?.bigCommerceId
                ? Number(_group.bigCommerceId)
                : undefined,
              accepts_product_review_abandoned_cart_emails: true,
            },
          ],
          {
            connection: customer.channel,
          },
        );

        metafieldResult = await this.upsertMetafield(
          customer.channel,
          customer.customer.id,
          contact,
          account,
        );
      }

      customerResults.push(customerResult);
      metafieldResults.push(metafieldResult);
    }

    if (enableHbh || enableDispomart) {
      const mongoAuth = this.getMongoAuth();

      const client = await MongoClient.connect(
        `mongodb+srv://${mongoAuth.username}:${mongoAuth.password}@${mongoAuth.hostname}/${mongoAuth.database}?retryWrites=true&w=majority`,
      );

      const db = client.db(mongoAuth.database);

      await db.collection('contact_person').updateOne(
        {
          email: contact.Email,
        },
        {
          $set: {
            hasAccount: true,
          },
        },
      );

      await client.close();
    }

    let flodeskSubscriptionResult;
    let flodeskSegmentResult;

    flodeskSubscriptionResult = await this.flodeskService.post(
      '/subscribers',
      {
        email: contact.Email,
        first_name: contact.First_Name,
        last_name: contact.Last_Name,
      },
      {
        connection: 'default',
      },
    );

    flodeskSegmentResult = await this.flodeskService.post(
      `/subscribers/${contact.Email}/segments`,
      {
        segment_ids: [
          enableHbh
            ? flodeskSegments.find(
                (s) => s.name === group.replace('Teir', 'Tier'),
              )?.id
            : null,
          enableHbh
            ? flodeskSegments.find(
                (s) => s.name === 'honeybeeherbwholesale.com',
              )?.id
            : null,
          enableDispomart
            ? flodeskSegments.find((s) => s.name === 'dispomart.supply')?.id
            : null,
        ].filter(Boolean),
      },
      {
        connection: 'default',
      },
    );

    return {
      flodeskSubscriptionResult,
      flodeskSegmentResult,
      metafieldResults,
      customerResults,
    };
  }
}
