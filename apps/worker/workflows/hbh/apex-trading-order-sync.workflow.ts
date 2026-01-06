import { ApexTradingService } from '#lib/apex-trading/apex-trading.service';
import { PaginatedResponse } from '#lib/apex-trading/types';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WebhookPayloadType } from '#lib/workflow/types';
import { Order } from '#lib/apex-trading/types/order';
import { ZohoService } from '#lib/zoho/zoho.service';
import { MongoService } from '#lib/core/services';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import { Logger } from '@nestjs/common';
import { keyBy } from 'lodash-es';
import { Buyer } from '#lib/apex-trading/types/buyer';

@Workflow({
  name: 'HBH - Apex Trading Order Sync',
  webhook: true,
  concurrency: 1,
  webhookPayloadType: WebhookPayloadType.Full,
  triggers: [
    cron('*/60 * * * *', {
      timezone: 'America/New_York', // Every 60 minutes
    }),
  ],
})
export class ApexTradingOrderSyncWorkflow extends WorkflowBase {
  constructor(
    private readonly apexTrading: ApexTradingService,

    private readonly zohoService: ZohoService,
    private readonly mongo: MongoService,
    private readonly env: EnvService,
  ) {
    super();
  }

  private logger = new Logger(ApexTradingOrderSyncWorkflow.name);

  private beginning = '2000-01-01T00:00:00Z';

  queryCRM(query) {
    return this.zohoService
      .post(
        `/crm/v8/coql`,
        {
          select_query: query,
        },
        {
          connection: 'hbh',
        },
      )
      .then((r) => r.data?.data?.[0])
      .catch((e) => {
        console.error(e.response?.data || e.message);
      });
  }

  findMostSimilarObject<T = Record<string, any>>(
    ref: T,
    objects: T[],
    excludeKeys: (keyof T)[] = [],
  ) {
    const map = objects.map((object) => ({
      object,
      ref,
      match: this.compareObjects(ref, object, excludeKeys),
    }));

    map.sort((a, b) => b.match.percentage - a.match.percentage);

    return objects.length === 0
      ? {
          object: null as T | null,
          ref,
          match: {
            matched: [],
            mismatched: [],
            percentage: 0,
          },
        }
      : map[0];
  }

  compareObjects<T = Record<string, any>>(
    a: T,
    b: T,
    excludeKeys: (keyof T)[] = [],
  ) {
    const keys = Object.keys(a).filter((k) => !excludeKeys.includes(k));
    const match = {
      matched: [] as (keyof T)[],
      mismatched: [] as (keyof T)[],
      percentage: 0,
    };

    for (const key of keys) {
      const types = new Set([typeof a[key], typeof b[key]]);

      let v1: unknown;
      let v2: unknown;

      if (types.size === 1 && types.has('string')) {
        v1 = a[key].trim().toLowerCase();
        v2 = b[key].trim().toLowerCase();
      } else if (types.has('string') && types.has('number')) {
        v1 = Number(a[key]);
        v2 = Number(b[key]);
      } else {
        v1 = a[key];
        v2 = b[key];
      }

      if (v1 === v2) {
        match.matched.push(key);
        match.percentage = match.matched.length * (100 / keys.length);
      } else {
        match.mismatched.push(key);
      }
    }

    return match;
  }

  async importIntoBooks(id: string, type: 'account' | 'contact') {
    await this.zohoService.post(
      `/books/v3/crm/${type}/${id}/import`,
      {},
      {
        connection: 'hbh',
        params: {
          organization_id: '776003162',
        },
      },
    );

    const { data: booksResponse } = await this.zohoService.get(
      `/books/v3/contacts`,
      {
        connection: 'hbh',
        params: {
          [`zcrm_${type}_id`]: id,
          organization_id: '893457005',
        },
      },
    );

    return booksResponse.contacts[0];
  }

  async getPrevTimestamp(): Promise<Date> {
    const job = await this.getPrevJob();

    if (job) {
      return job.createdAt;
    }

    return new Date(this.beginning);
  }

  @Step(1)
  async fetchOrders() {
    if (!this.env.isProd) {
      return this.cancel('Not running in development environment');
    }

    const timestamp = await this.getPrevTimestamp();

    const apexProducts = await this.mongo
      .db('hbh')
      .collection('apex_products')
      .find<{ id: number; sku: string }>({})
      .toArray()
      .then((arr) => new Set(arr.map((p) => p.id)));

    const orders: Order[] = [];

    for (let page = 1; ; page++) {
      const { data } = await this.apexTrading.get<
        PaginatedResponse<{ orders: Order[] }>
      >(
        `/v1/shipping-orders?page=${page}&per_page=200&updated_at_from=${this.beginning}&created_at_from=${timestamp.toISOString()}`,
        {
          connection: 'dispomart',
        },
      );

      for (const order of data.orders) {
        const hasMatchingItem = order.items.some((item) =>
          apexProducts.has(item.product_id),
        );

        if (hasMatchingItem) {
          orders.push(order);
        }
      }

      if (data.meta.last_page <= page) {
        break;
      }
    }

    if (orders.length === 0) {
      return this.cancel('No orders to process.');
    }

    return orders;
  }

  @Step(2)
  async ensureCRMAccount() {
    const orders = (await this.getResult<Order[]>('fetchOrders'))!;
    const result: {
      orderId: number;
      apexIds: string;
      accountId: string;
      created: boolean;
    }[] = [];

    for (const order of orders) {
      const {
        data: { buyer: apexCustomer },
      } = await this.apexTrading.get<{
        buyer: Buyer;
      }>(`/v1/buyers/${order.buyer_id}`, {
        connection: 'dispomart',
      });

      const email = order.buyer_contact_email.toLowerCase();
      const firstName = order.buyer_contact_name.split(' ')[0];
      const lastName =
        order.buyer_contact_name.split(' ').slice(1).join(' ') || '.';
      const company = apexCustomer.name;

      const {
        data: { data: accounts },
      } = await this.zohoService.get(
        `/crm/v8/Accounts/search?criteria=(Apex_Trading_IDs:equals:'A${apexCustomer.id}T')`,
        {
          connection: 'hbh',
        },
      );

      if (accounts.length > 0) {
        result.push({
          orderId: order.id,
          apexIds: accounts[0].Apex_Trading_IDs,
          accountId: accounts[0].id.toString(),
          created: false,
        });
        continue;
      }

      const crmContact = await this.queryCRM(
        `select Account_Name.id as accountId, Account_Name.Apex_Trading_IDs as apexIds
       from Contacts
       where (Email = '${email}' or Removed_Email = '${email}') or (Account_Name.Account_Name = '${company.replaceAll("'", "''").trim()}')
       limit 1`,
      );

      if (crmContact) {
        this.logger.log(
          `Found existing CRM contact for email/company: ${email} / ${company}`,
        );

        result.push({
          orderId: order.id,
          apexIds: crmContact.apexIds,
          accountId: crmContact.accountId.toString(),
          created: false,
        });
        continue;
      }

      // Create new account in Zoho CRM
      const { data: accountResults } = await this.zohoService.post(
        '/crm/v8/Accounts',
        {
          data: [
            {
              Account_Name: company,
              Account_Owner: {
                id: '5279830000097788053',
              },
              Customer_Type: 'business',
              Email: email,
              Phone: order.buyer_contact_phone,
              Shipping_City: order.ship_city,
              Shipping_State: order.ship_state,
              Shipping_Country: order.ship_country,
              Shipping_Code: order.ship_zip,
              Shipping_Street: `${order.ship_line_one ? (order.ship_line_one ? order.ship_line_two + ', ' : order.ship_line_two) : ''}${order.ship_line_two}`,
            },
          ],
        },
        {
          connection: 'hbh',
        },
      );

      const accountId = accountResults.data[0]?.details?.id;

      // Create new contact in Zoho CRM
      await this.zohoService.post(
        '/crm/v8/Contacts',
        {
          data: [
            {
              First_Name: firstName,
              Last_Name: lastName,
              Email: email,
              Account_Name: {
                id: accountId,
              },
            },
          ],
        },
        {
          connection: 'hbh',
        },
      );

      result.push({
        orderId: order.id,
        apexIds: `A${apexCustomer.id}T`,
        accountId: accountId.toString(),
        created: true,
      });
    }

    return result;
  }

  @Step(3)
  async ensureInventoryCustomer() {
    const crmAccounts =
      (await this.getResult<
        ReturnType<ApexTradingOrderSyncWorkflow['ensureCRMAccount']>
      >('ensureCRMAccount'))!;

    const results: {
      orderId: number;
      contact: Record<string, any>;
    }[] = [];

    for (const crmAccount of crmAccounts) {
      const inventoryAccount = await this.importIntoBooks(
        crmAccount.accountId,
        'account',
      );

      const {
        data: { contact },
      } = await this.zohoService.get(
        `/inventory/v1/contacts/${inventoryAccount.contact_id}`,
        {
          connection: 'hbh',
          params: {
            organization_id: '776003162',
          },
        },
      );

      await this.mongo
        .db('hbh')
        .collection('customer')
        .updateOne(
          { id: contact.contact_id },
          {
            $set: {
              id: contact.contact_id,
              company: contact.company_name,
              group: contact.cf_bigcommerce_customer_group?.trim(),
              firstName: contact.first_name,
              lastName: contact.last_name,
              email: contact.email,
              phone: contact.phone,
              mobile: contact.mobile,
            },
          },
          { upsert: true },
        );

      await this.mongo
        .db('hbh')
        .collection('contact_person')
        .bulkWrite(
          contact.contact_persons.map((c) => ({
            updateOne: {
              filter: { email: c.email },
              update: {
                $set: {
                  id: c.contact_person_id,
                  customerId: contact.contact_id,
                  firstName: c.first_name,
                  lastName: c.last_name,
                  email: c.email,
                  phone: c.phone,
                  mobile: c.mobile,
                  isPrimary: c.is_primary_contact,
                  hasAccount: false,
                },
              },
              upsert: true,
            },
          })),
        );

      results.push({
        orderId: crmAccount.orderId,
        contact,
      });
    }

    return results;
  }

  @Step(4)
  async ensureAddresses() {
    const customers = (await this.getResult<
      ReturnType<ApexTradingOrderSyncWorkflow['ensureInventoryCustomer']>
    >('ensureInventoryCustomer'))!;

    const orders = (await this.getResult<Order[]>('fetchOrders'))!;

    const results: {
      orderId: number;
      shippingAddressId: string;
    }[] = [];

    for (const c of customers) {
      const customer = c.contact;
      const order = orders.find((o) => o.id === c.orderId)!;

      const shippingAddresses = [
        customer.shipping_address,
        ...customer.addresses,
      ];

      const shippingAddress = {
        attention: order.ship_name,
        city: order.ship_city,
        country_code: order.ship_country,
        zip: order.ship_zip,
        state: order.ship_state,
        address: order.ship_line_one,
        street2: order.ship_from_line_two,
        phone: order.buyer_contact_phone,
      };

      const excludeMatchFields = [
        'first_name',
        'last_name',
        'name',
        'address_id',
      ];

      const shippingAddressMatch = this.findMostSimilarObject(
        shippingAddress,
        shippingAddresses,
        excludeMatchFields,
      );

      let shippingAddressId =
        shippingAddressMatch?.match.percentage === 100
          ? shippingAddressMatch.object.address_id
          : null;

      if (!shippingAddressId) {
        const addressesToCreate = [
          {
            type: 'shipping',
            source: shippingAddress,
          },
        ];

        const countries = await this.mongo
          .db('hbh')
          .collection('inventory_countries')
          .find({
            code: {
              $in: addressesToCreate.map((a) => a.source.country_code),
            },
          })
          .toArray();

        for (const address of addressesToCreate) {
          const country = countries.find(
            (c) => c.code === address.source.country_code,
          );

          const { data: response } = await this.zohoService.post(
            `/inventory/v1/contacts/${customer.contact_id}/address`,
            {
              ...address.source,
              country: country?.id,
            },
            {
              connection: 'hbh',
              params: {
                organization_id: '776003162',
              },
            },
          );

          if (address.type === 'both') {
            shippingAddressId = response.address_info.address_id;
          } else if (address.type === 'billing') {
            // ignored for now
          } else if (address.type === 'shipping') {
            shippingAddressId = response.address_info.address_id;
          }

          if (addressesToCreate.length > 1) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }

      results.push({
        orderId: c.orderId,
        shippingAddressId,
      });
    }

    return results;
  }

  @Step(5)
  async fetchItems() {
    const orders = (await this.getResult<Order[]>('fetchOrders'))!;

    const results: {
      orderId: number;
      items: Record<string, any>[];
    }[] = [];

    for (const order of orders) {
      const skus = new Set(
        order.items.map((i) => i.product_sku?.trim()).filter(Boolean),
      );

      const zohoItems = await this.mongo
        .db('hbh')
        .collection('item')
        .find({
          sku: {
            $in: Array.from(skus),
          },
        })
        .toArray();

      results.push({
        orderId: order.id,
        items: zohoItems,
      });
    }

    return results;
  }

  @Step(6)
  async createOrder() {
    const orders = (await this.getResult<Order[]>('fetchOrders'))!;
    const allCustomers = (await this.getResult<
      ReturnType<ApexTradingOrderSyncWorkflow['ensureInventoryCustomer']>
    >('ensureInventoryCustomer'))!;
    const allAddresses =
      (await this.getResult<
        ReturnType<ApexTradingOrderSyncWorkflow['ensureAddresses']>
      >('ensureAddresses'))!;
    const allItems =
      (await this.getResult<
        ReturnType<ApexTradingOrderSyncWorkflow['fetchItems']>
      >('fetchItems'))!;

    const results: {
      order: Record<string, any>;
      invoice: Record<string, any> | null;
    }[] = [];

    for (const order of orders) {
      const zohoItems =
        allItems.find((i) => i.orderId === order.id)?.items || [];
      const customer = allCustomers.find(
        (c) => c.orderId === order.id,
      )?.contact;
      const shippingAddressesId = allAddresses.find(
        (a) => a.orderId === order.id,
      )?.shippingAddressId;

      if (zohoItems.length === 0) {
        return this.cancel('No matching items found in Zoho Inventory.');
      }

      const createOrder = async () => {
        const zohoItemsBySKU = keyBy(zohoItems, 'sku');

        const total = order.items.reduce(
          (acc, item) => acc + (Number(item.unit_price) || 0),
          0,
        );
        const discount = total - Number(order.subtotal);

        const deliveryDate = order.delivery_date
          ? new Date(order.delivery_date)
          : null;

        return await this.zohoService
          .post(
            `/inventory/v1/salesorders`,
            {
              customer_id: customer.contact_id,
              reference_number: `AT_Order_${order.id}`,
              notes: order.notes,
              shipping_charge: 0,
              discount_type: 'entity_level',
              discount: discount.toFixed(2),
              shipping_address_id: shippingAddressesId,
              shipment_date: deliveryDate,
              pricebook_id: customer.pricebook_id,
              custom_fields: [
                {
                  customfield_id: '3195387000014025119',
                  value: !!deliveryDate,
                },
              ],
              line_items: order.items
                .map((i) => {
                  const item = zohoItemsBySKU[i.product_sku?.trim()];

                  return {
                    item_id: item.item_id,
                    quantity: i.order_quantity,
                    rate: item.unit_price_original,
                  };
                })
                .reduce((a, b) => {
                  const existing = a.find((i) => i.item_id === b.item_id);

                  if (existing) {
                    existing.quantity += b.quantity;
                  } else {
                    a.push(b);
                  }

                  return a;
                }, []),
            },
            {
              connection: 'hbh',
              params: {
                organization_id: '776003162',
                ignore_auto_number_generation: false,
              },
            },
          )
          .then((r) => r.data);
      };

      const { salesorder } = await createOrder();

      await this.zohoService
        .post(
          `/inventory/v1/salesorders/${salesorder.salesorder_id}/status/confirmed`,
          {},
          {
            connection: 'hbh',
            params: {
              organization_id: '776003162',
            },
          },
        )
        .then((res) => res.data);

      try {
        await this.zohoService.post(
          `/inventory/v1/invoices`,
          {
            customer_id: customer.contact_id,
            reference_number: salesorder.reference_number,
            shipping_charge: salesorder.shipping_charge,
            date: salesorder.date,
            is_inclusive_tax: false,
            discount: salesorder.discount,
            discount_type: salesorder.discount_type,
            billing_address_id: salesorder.billing_address_id,
            shipping_address_id: salesorder.shipping_address_id,
            delivery_method: salesorder.delivery_method,
            location_id: salesorder.location_id,
            line_items: salesorder.line_items.map((i) => ({
              item_id: i.item_id,
              quantity: i.quantity,
              rate: i.rate,
              location_id: i.location_id,
              salesorder_item_id: i.line_item_id,
            })),
            template_id: '3195387000000842128',
            pricebook_id: customer.pricebook_id,
            due_date: salesorder.date,
          },
          {
            connection: 'hbh',
            params: {
              organization_id: '776003162',
              ignore_auto_number_generation: false,
            },
          },
        );

        results.push({
          order: salesorder,
          invoice: null,
        });
      } catch (e) {
        console.log(e.response?.data ?? e);
      }
    }

    return results;
  }
}
