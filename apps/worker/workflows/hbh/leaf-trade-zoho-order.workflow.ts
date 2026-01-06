import { LeafTradeService } from '#lib/leaftrade/leaf-trade.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WebhookPayloadType } from '#lib/workflow/types';
import { ZohoService } from '#lib/zoho/zoho.service';
import { MongoService } from '#lib/core/services';
import { WorkflowBase } from '#lib/workflow/misc';
import { Logger } from '@nestjs/common';
import { keyBy } from 'lodash-es';

@Workflow({
  name: 'HBH - Push leaf trade orders to Zoho',
  webhook: true,
  concurrency: 1,
  webhookPayloadType: WebhookPayloadType.Full,
})
export class LeafTradeZohoOrderWorkflow extends WorkflowBase {
  constructor(
    private readonly leafTrade: LeafTradeService,
    private readonly zohoService: ZohoService,
    private readonly mongo: MongoService,
  ) {
    super();
  }

  private logger = new Logger(LeafTradeZohoOrderWorkflow.name);

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

  @Step(1)
  async validate() {
    const { id, status } = this.payload.body;

    const db = this.mongo.db('hbh');

    const existing = await db
      .collection('leaf_trade_order')
      .findOne({ leafTradeId: id });

    if (!existing) {
      return;
    }

    if (existing.void) {
      return this.cancel(`Order is already voided.`);
    }

    if (status !== 'cancelled') {
      return this.cancel('Existing order is not cancelled.');
    }

    return existing;
  }

  @Step(2)
  async updateOrder() {
    const existing = await this.getResult('validate');

    if (!existing) {
      return;
    }

    // void the invoice
    await this.zohoService.post(
      `/inventory/v1/invoices/${existing.invoiceId}/status/void`,
      {},
      {
        connection: 'hbh',
        params: {
          organization_id: '776003162',
        },
      },
    );

    // void the order
    await this.zohoService.post(
      `/inventory/v1/salesorders/${existing.zohoOrderId}/status/void`,
      {},
      {
        connection: 'hbh',
        params: {
          organization_id: '776003162',
        },
      },
    );
    const db = this.mongo.db('leaf_trade_order');

    await db.collection('').updateOne(
      {
        leafTradeId: this.payload.body.id,
      },
      {
        $set: {
          void: true,
          updatedAt: new Date(),
        },
      },
    );

    return this.exit();
  }

  @Step(3)
  async ensureCRMAccount() {
    const order = this.payload.body;

    const { data: leafCustomer } = await this.leafTrade.get(
      `/v3/vendor/dispensaries/${order.dispensary_location.dispensary_id}`,
      {
        connection: 'cannadevice',
      },
    );

    const billing = order.billing_address;
    const shipping = order.shipping_address;

    const email = (leafCustomer?.email || order.user_email).toLowerCase();
    const firstName = billing.first_name;
    const lastName = billing.last_name;
    const company = leafCustomer.name;

    const {
      data: { data: accounts },
    } = await this.zohoService.get(
      `/crm/v8/Accounts/search?criteria=(Leaf_Trade_IDs:equals:'L${leafCustomer.id}T')`,
      {
        connection: 'hbh',
      },
    );

    if (accounts.length > 0) {
      return {
        accountId: accounts[0].id,
        leafIds: accounts[0].Leaf_Trade_IDs,
        created: false,
      };
    }

    let crmContact = await this.queryCRM(
      `select Account_Name.id as accountId, Account_Name.Leaf_Trade_IDs as leafIds
       from Contacts
       where (Email = '${email}' or Removed_Email = '${email}') or (Account_Name.Account_Name = '${company.replaceAll("'", "''").trim()}')
       limit 1`,
    );

    if (crmContact) {
      this.logger.log(
        `Found existing CRM contact for email/company: ${email} / ${company}`,
      );

      return {
        ...crmContact,
        created: false,
      };
    }

    const billing1 = billing.street_address_1;
    const billing2 = billing.street_address_2;
    const shipping1 = shipping.street_address_1;
    const shipping2 = shipping.street_address_2;

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
            Phone: billing.phone,
            Billing_City: billing.city,
            Billing_State: billing.state,
            Billing_Country: billing.country,
            Billing_Code: billing.postcode,
            Billing_Street: `${billing2 ? (billing1 ? billing2 + ', ' : billing2) : ''}${billing1}`,
            Shipping_City: shipping.city,
            Shipping_State: shipping.state,
            Shipping_Country: shipping.country,
            Shipping_Code: shipping.postcode,
            Shipping_Street: `${shipping2 ? (shipping1 ? shipping2 + ', ' : shipping2) : ''}${billing2}`,
          },
        ],
      },
      {
        connection: 'hbh',
      },
    );

    const accountId = accountResults.data[0]?.details?.id;

    // Create new contact in Zoho CRM
    const { data: contactResults } = await this.zohoService.post(
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

    return {
      id: contactResults.data[0]?.details?.id,
      accountId: accountId,
      created: true,
    };
  }

  @Step(4)
  async ensureInventoryCustomer() {
    const crmContact = await this.getResult('ensureCRMAccount');

    const inventoryAccount = await this.importIntoBooks(
      crmContact.accountId,
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

    return contact;
  }

  @Step(5)
  async ensureAddresses() {
    const order = this.payload.body;
    const customer = await this.getResult('ensureInventoryCustomer');

    const shippingAddresses = [
      customer.shipping_address,
      ...customer.addresses,
    ];
    const billingAddresses = [customer.billing_address, ...customer.addresses];

    const billing = order.billing_address;
    const shipping = order.shipping_address;

    const billingAddress = {
      attention: `${billing.first_name} ${billing.last_name || '.'}`,
      city: billing.city,
      country_code: billing.country,
      zip: billing.postal_code,
      state: billing.state,
      address: billing.street_address_1,
      street2: billing.street_address_2,
      phone: billing.phone,
    };

    const shippingAddress = {
      attention: `${shipping.first_name} ${shipping.last_name || '.'}`,
      city: shipping.city,
      country_code: shipping.country,
      zip: shipping.postal_code,
      state: shipping.state,
      address: shipping.street_address_1,
      street2: shipping.street_address_2,
      phone: shipping.phone,
    };

    const excludeMatchFields = [
      'first_name',
      'last_name',
      'name',
      'address_id',
    ];

    const billingAddressMatch = this.findMostSimilarObject(
      billingAddress,
      billingAddresses,
      excludeMatchFields,
    );

    const shippingAddressMatch = this.findMostSimilarObject(
      shippingAddress,
      shippingAddresses,
      excludeMatchFields,
    );

    let shippingAddressId =
      shippingAddressMatch?.match.percentage === 100
        ? shippingAddressMatch.object.address_id
        : null;
    let billingAddressId =
      billingAddressMatch?.match.percentage === 100
        ? billingAddressMatch.object.address_id
        : null;

    if (!billingAddressId || !shippingAddressId) {
      const addressesToCreate = [];

      const billingShippingMatch = this.compareObjects(
        billingAddress,
        shippingAddress,
      );

      if (billingShippingMatch.percentage === 100) {
        addressesToCreate.push({
          type: 'both',
          source: billingAddress,
        });
      } else {
        if (!billingAddressId) {
          addressesToCreate.push({
            type: 'billing',
            source: billingAddress,
          });
        }

        if (!shippingAddressId) {
          addressesToCreate.push({
            type: 'shipping',
            source: billingAddress,
          });
        }
      }

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
          billingAddressId = response.address_info.address_id;
          shippingAddressId = response.address_info.address_id;
        } else if (address.type === 'billing') {
          billingAddressId = response.address_info.address_id;
        } else if (address.type === 'shipping') {
          shippingAddressId = response.address_info.address_id;
        }

        if (addressesToCreate.length > 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    return {
      billingAddressId,
      shippingAddressId,
    };
  }

  @Step(6)
  async fetchItems() {
    const order = this.payload.body;

    const leafItems = [];

    for (let page = 1; ; page++) {
      const {
        data: { results: items },
      } = await this.leafTrade.get(
        `/v4/vendor/ordered-items?order_ids=${order.id}&page=${page}&page_size=50`,
        {
          connection: 'cannadevice',
        },
      );

      leafItems.push(...items);

      if (items.length < 50) {
        break;
      }
    }

    const skus = new Set(
      leafItems.map((i) => i.product_sku?.trim()).filter(Boolean),
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

    return {
      zohoItems,
      leafItems,
    };
  }

  @Step(7)
  async createOrder() {
    const { zohoItems, leafItems } = await this.getResult('fetchItems');
    const { billingAddressId, shippingAddressesId } =
      await this.getResult('ensureAddresses');
    const customer = await this.getResult('ensureInventoryCustomer');
    const order = this.payload.body;

    if (zohoItems.length === 0) {
      return this.cancel('No matching items found in Zoho Inventory.');
    }

    const createOrder = async () => {
      const zohoItemsBySKU = keyBy(zohoItems, 'sku');

      const total = (leafItems as Record<string, any>[]).reduce(
        (acc, item) => acc + (Number(item.unit_price_original) || 0),
        0,
      );
      const discount = total - Number(order.total_net);

      const deliveryDate = order.delivery_date
        ? new Date(order.delivery_date)
        : null;

      return await this.zohoService
        .post(
          `/inventory/v1/salesorders`,
          {
            customer_id: customer.contact_id,
            reference_number: `LT_Order_${order.display_id}`,
            notes: order.internal_notes,
            shipping_charge: Number(order.shipping_amount),
            discount_type: 'entity_level',
            discount: discount.toFixed(2),
            billing_address_id: billingAddressId,
            shipping_address_id: shippingAddressesId,
            shipment_date: deliveryDate,
            pricebook_id: customer.pricebook_id,
            custom_fields: [
              {
                customfield_id: '3195387000014025119',
                value: !!deliveryDate,
              },
            ],
            line_items: leafItems
              .map((i) => {
                const item = zohoItemsBySKU[i.product_sku?.trim()];

                return {
                  item_id: item.item_id,
                  quantity: i.quantity,
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

    return await createOrder();
  }

  @Step(8)
  async markOrderAsConfirmed() {
    const { salesorder } = await this.getResult('createOrder');

    return await this.zohoService
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
  }

  @Step(9)
  async createInvoice() {
    const { billingAddressId, shippingAddressId } =
      await this.getResult('ensureAddresses');
    const { salesorder } = await this.getResult('createOrder');
    const customer = await this.getResult('ensureInventoryCustomer');

    try {
      const { data: result } = await this.zohoService.post(
        `/inventory/v1/invoices`,
        {
          customer_id: customer.contact_id,
          reference_number: salesorder.reference_number,
          shipping_charge: salesorder.shipping_charge,
          date: salesorder.date,
          is_inclusive_tax: false,
          discount: salesorder.discount,
          discount_type: salesorder.discount_type,
          billing_address_id: billingAddressId,
          shipping_address_id: shippingAddressId,
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

      return result;
    } catch (e) {
      console.log(e.response?.data ?? e);
    }
  }
}
