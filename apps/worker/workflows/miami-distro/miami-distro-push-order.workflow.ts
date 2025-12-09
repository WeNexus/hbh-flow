import { WoocommerceService } from '#lib/woocommerce/woocommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { Customers } from 'woocommerce-rest-ts-api';
import { WorkflowBase } from '#lib/workflow/misc';
import { keyBy, difference } from 'lodash-es';
import { EnvService } from '#lib/core/env';
import { Logger } from '@nestjs/common';
import mongodb from 'mongodb';

const MongoClient = mongodb.MongoClient;

class CustomError extends Error {}

@Workflow({
  name: 'Miami Distro - Push Order to Zoho Inventory',
  webhook: true,
  concurrency: 1,
})
export class MiamiDistroPushOrderWorkflow extends WorkflowBase {
  constructor(
    private readonly wooService: WoocommerceService,
    private readonly zohoService: ZohoService,
    private readonly envService: EnvService,
  ) {
    super();
  }

  private logger = new Logger(MiamiDistroPushOrderWorkflow.name);

  private customerIds: Record<string, string> = {
    the_delta_boss: '6673885000000482445',
  };

  getSource() {
    return new URL(this.payload._links.self[0].href).origin;
  }

  getWooConnection() {
    const url = this.getSource();
    const map = {
      'https://thedeltaboss.com': 'the_delta_boss',
      'https://hempthrill.com': 'hempthrill',
      'https://savagemedolls.com': 'savage_me_dolls',
      'https://shopfullcircle.com': 'shop_full_circle',
      'https://shopbesavage.com': 'shop_be_savage',
      'https://miamidistro.com': 'miami_distro',
    };

    return map[url];
  }

  queryCRM(query) {
    return this.zohoService
      .post(
        `/crm/v8/coql`,
        {
          select_query: query,
        },
        {
          connection: 'miami_distro',
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
        connection: 'miami_distro',
        params: {
          organization_id: '893457005',
        },
      },
    );

    const { data: booksResponse } = await this.zohoService.get(
      `/books/v3/contacts`,
      {
        connection: 'miami_distro',
        params: {
          [`zcrm_${type}_id`]: id,
          organization_id: '893457005',
        },
      },
    );

    return booksResponse.contacts[0];
  }

  async onFailure(_: string, e: Error) {
    const order = this.payload;

    const payload = {
      text: (e as any).response?.data
        ? '```' + JSON.stringify((e as any).response?.data) + '```'
        : e instanceof CustomError
          ? e.message
          : 'An unknown error occurred.',
      card: {
        title: `Order ${order.number} failed to push to Inventory — ${this.getSource()}`,
        theme: 'modern-inline',
      },
    };

    await this.zohoService.notifySubscribers({
      connection: 'miami_distro',
      topic: 'new_order_push_failed',
      payload,
    });
  }

  @Step(1)
  async verification() {
    if (this.payload.webhook_id) {
      return this.cancel();
    }

    if (
      this.payload.status !== 'cancelled' &&
      this.payload.status !== 'processing'
    ) {
      return this.cancel(`Order status is ${this.payload.status}`);
    }

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db('hbh');

    const existing = await db
      .collection('miami_distro_order')
      .findOne({ wooOrderId: this.payload.id });

    await client.close();

    if (!existing && this.payload.status === 'cancelled') {
      return this.cancel(`Order does not exist and is cancelled`);
    }

    return existing;
  }

  @Step(2)
  async updateOrder() {
    const existing = await this.getResult('verification');

    if (!existing) {
      return;
    }

    if (existing.void || this.payload.status !== 'cancelled') {
      return this.cancel();
    }

    // void the invoice
    await this.zohoService.post(
      `/inventory/v1/invoices/${existing.invoiceId}/status/void`,
      {},
      {
        connection: 'miami_distro',
        params: {
          organization_id: '893457005',
        },
      },
    );

    // void the order
    await this.zohoService.post(
      `/inventory/v1/salesorders/${existing.zohoOrderId}/status/void`,
      {},
      {
        connection: 'miami_distro',
        params: {
          organization_id: '893457005',
        },
      },
    );

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db('hbh');

    await db.collection('miami_distro_order').updateOne(
      {
        wooOrderId: this.payload.id,
      },
      {
        $set: {
          void: true,
          updatedAt: new Date(),
        },
      },
    );

    await client.close();

    return this.exit();
  }

  @Step(3)
  async ensureCRMAccount() {
    const connection = this.getWooConnection();

    if (Object.prototype.hasOwnProperty.call(this.customerIds, connection)) {
      return;
    }

    const client = this.wooService.getClient(connection);
    const order = this.payload;

    let wooCustomer: Customers | null;

    if (order.customer_id && order.customer_id !== 0) {
      const { data } = await client.getCustomer(order.customer_id);
      wooCustomer = data;
    } else {
      const { data } = await client.getCustomers({
        email: order.billing.email,
      });
      wooCustomer = data.length > 0 ? data[0] : null;
    }

    const billing = order.billing || wooCustomer?.billing;
    const shipping = order.shipping || wooCustomer?.shipping;

    const email = (wooCustomer?.email || billing.email).toLowerCase();
    const firstName = billing.first_name || wooCustomer?.first_name;
    const lastName = billing.last_name || wooCustomer?.last_name || '.';
    const company = billing?.company || `${firstName} ${lastName || '.'}`;

    let crmContact = await this.queryCRM(
      `select Account_Name.id as accountId
       from Contacts
       where (Email = '${email}') or (Account_Name.Account_Name = '${company.replaceAll("'", "''").trim()}' and First_Name = '${firstName
         .replaceAll("'", "''")
         .trim()}')
       limit 1`,
    );

    if (crmContact) {
      return {
        ...crmContact,
        created: false,
      };
    }

    const billing1 = billing.address_1;
    const billing2 = billing.address_2;
    const shipping1 = shipping.address_1;
    const shipping2 = shipping.address_2;

    // Create new account in Zoho CRM
    const { data: accountResults } = await this.zohoService.post(
      '/crm/v8/Accounts',
      {
        data: [
          {
            Account_Name: company,
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
        connection: 'miami_distro',
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
        connection: 'miami_distro',
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
    const connection = this.getWooConnection();

    let contactId: string | undefined;

    if (Object.prototype.hasOwnProperty.call(this.customerIds, connection)) {
      contactId = this.customerIds[connection];
    } else {
      const crmContact = await this.getResult('ensureCRMAccount');

      const inventoryAccount = await this.importIntoBooks(
        crmContact.accountId,
        'account',
      );

      contactId = inventoryAccount.contact_id;
    }

    const { data: result } = await this.zohoService.get(
      `/inventory/v1/contacts/${contactId}`,
      {
        connection: 'miami_distro',
        params: {
          organization_id: '893457005',
        },
      },
    );

    return result.contact;
  }

  @Step(5)
  async ensureAddresses() {
    const order = this.payload;
    const customer = await this.getResult('ensureInventoryCustomer');

    const shippingAddresses = [
      customer.shipping_address,
      ...customer.addresses,
    ];
    const billingAddresses = [customer.billing_address, ...customer.addresses];

    const billingAddress = {
      attention: `${order.billing.first_name} ${order.billing.last_name || '.'}`,
      city: order.billing.city,
      country_code: order.billing.country,
      zip: order.billing.postcode,
      state: order.billing.state,
      address: order.billing.address_1,
      street2: order.billing.address_2,
      phone: order.billing.phone,
    };

    const shippingAddress = {
      attention: `${order.shipping.first_name} ${order.shipping.last_name || '.'}`,
      city: order.shipping.city,
      country_code: order.shipping.country,
      zip: order.shipping.postcode,
      state: order.shipping.state,
      address: order.shipping.address_1,
      street2: order.shipping.address_2,
      phone: order.billing.phone,
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

      const client = await MongoClient.connect(
        this.envService.getString('MONGO_URL'),
      );

      const countries = await client
        .db('hbh')
        .collection('inventory_countries')
        .find({
          code: {
            $in: addressesToCreate.map((a) => a.source.country_code),
          },
        })
        .toArray();

      await client.close();

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
            connection: 'miami_distro',
            params: {
              organization_id: '893457005',
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
    const order = this.payload;
    const skus = Array.from(
      new Set(
        order.line_items.map((item) => item.sku?.trim()).filter((sku) => sku),
      ),
    );

    const zohoItems = [];

    for (const sku of skus) {
      const { data } = await this.zohoService.get('/inventory/v1/items', {
        connection: 'miami_distro',
        params: {
          organization_id: '893457005',
          sku,
        },
      });

      if (data.items.length > 0) {
        zohoItems.push(data.items[0]);
      }

      await new Promise((r) => setTimeout(r, 600));
    }

    // const client = this.wooService.getClient('miami_distro');
    // const wooItems = [];
    //
    // const chunks = chunk(
    //   order.line_items.map((i) => ({
    //     productId: i.product_id,
    //     variationId: i.variation_id,
    //     sku: i.sku?.trim(),
    //   })),
    //   10,
    // );
    //
    // for (const ids of chunks) {
    //   const results = await client.getProducts({
    //     include: ids.map((i) => i.variationId || i.productId).join(','),
    //   });
    //
    //   wooItems.push(...results.data);
    //
    //   await new Promise((r) => setTimeout(r, 600));
    // }

    return {
      zohoItems,
      // wooItems,
    };
  }

  @Step(7)
  async createOrder() {
    const { zohoItems } = await this.getResult('fetchItems');
    const { billingAddressId, shippingAddressesId } =
      await this.getResult('ensureAddresses');
    const customer = await this.getResult('ensureInventoryCustomer');
    const order = this.payload;

    const createOrder = async () => {
      const zohoItemsBySKU = keyBy(zohoItems, 'sku');

      if (zohoItems.length !== order.line_items.length) {
        const zohoSkus = Object.keys(zohoItemsBySKU);
        const wooSkus = Array.from(
          new Set(
            order.line_items
              .map((item) => item.sku?.trim())
              .filter((sku) => sku),
          ),
        );

        const missingSKUs = difference(wooSkus, zohoSkus);

        throw new CustomError(
          `Missing items in Zoho Inventory for SKUs: ${missingSKUs.join(', ')}`,
        );
      }

      const discount = Number(order.discount_total);

      return await this.zohoService
        .post(
          `/inventory/v1/salesorders`,
          {
            customer_id: customer.contact_id,
            reference_number: order.number,
            notes: `${order.coupon_lines.length > 0 ? `Coupon: ${order.coupon_lines[0].code}\n\n` : ''}Customer Note: ${order.customer_note}`,
            shipping_charge: Number(order.shipping_total),
            discount_type: 'entity_level',
            discount: discount.toFixed(2),
            billing_address_id: billingAddressId,
            shipping_address_id: shippingAddressesId,
            delivery_method: order.shipping_lines[0]?.method_title,
            line_items: order.line_items
              .map((i) => {
                const item = zohoItemsBySKU[i.sku?.trim()];
                return {
                  item_id: item.item_id,
                  quantity: i.quantity,
                  rate: i.subtotal / i.quantity,
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
            connection: 'miami_distro',
            params: {
              organization_id: '893457005',
              ignore_auto_number_generation: false,
            },
          },
        )
        .then((r) => r.data);
    };

    return await createOrder();
  }

  @Step(8)
  async submitForApproval() {
    if (/cod/gim.test(this.payload.payment_method)) {
      return { skipped: true };
    }

    const { salesorder } = await this.getResult('createOrder');

    return await this.zohoService
      .post(
        `/inventory/v1/salesorders/${salesorder.salesorder_id}/submit`,
        {},
        {
          connection: 'miami_distro',
          params: {
            organization_id: '893457005',
          },
        },
      )
      .then((res) => res.data);
  }

  @Step(9)
  async createInvoice() {
    if (/cod/gim.test(this.payload.payment_method)) {
      return { skipped: true };
    }

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
        },
        {
          connection: 'miami_distro',
          params: {
            organization_id: '893457005',
            ignore_auto_number_generation: false,
          },
        },
      );

      return result;
    } catch (e) {
      console.log(e.response?.data ?? e);
    }
  }

  @Step(10)
  async sendAndMarkInvoiceAsPaid() {
    if (/cod/gim.test(this.payload.payment_method)) {
      return { skipped: true };
    }

    const order = this.payload;
    const { invoice } = await this.getResult('createInvoice');

    const { data: sentResult } = await this.zohoService.post(
      `/inventory/v1/invoices/${invoice.invoice_id}/status/sent`,
      {},
      {
        connection: 'miami_distro',
        params: {
          organization_id: '893457005',
        },
      },
    );

    const paymentMethod = order.payment_method;

    if (invoice.total <= 0 || /invoice/gim.test(paymentMethod)) {
      return { sentResult };
    }

    const paymentMode = /authorize/gim.test(paymentMethod)
      ? 'Authorize.Net'
      : /bacs/gim.test(paymentMethod)
        ? 'Bank Transfer'
        : /cheque/gim.test(paymentMethod)
          ? 'Check'
          : 'Cash';

    const { data: paymentResult } = await this.zohoService.post(
      `/inventory/v1/customerpayments`,
      {
        customer_id: invoice.customer_id,
        location_id: invoice.location_id,
        payment_mode: paymentMode,
        payment_status: /cod/gim.test(paymentMethod) ? 'draft' : 'paid',
        date: invoice.date,
        amount: invoice.total,
        account_id:
          paymentMode === 'Authorize.Net'
            ? '6673885000000311013' // Business Checking - 8653
            : paymentMode == 'Bank Transfer'
              ? '6673885000000311023' // Full Circle - Business Checking Plus - 9868
              : paymentMode === 'Check'
                ? '6673885000000311033' // Business Checking Plus - 9876
                : '6673885000000000361', // Petty cash
        reference_number: order.transaction_id,
        invoices: [
          {
            invoice_id: invoice.invoice_id,
            amount_applied: invoice.total,
          },
        ],
      },
      {
        connection: 'miami_distro',
        params: {
          organization_id: '893457005',
        },
      },
    );

    return {
      sentResult,
      paymentResult,
    };
  }

  @Step(11)
  async storeInDB() {
    const order = this.payload;
    const { salesorder } = await this.getResult('createOrder');
    const { invoice } = await this.getResult('createInvoice');

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db('hbh');

    await db.collection('miami_distro_order').insertOne({
      wooOrderId: order.id,
      zohoOrderId: salesorder.salesorder_id,
      invoiceId: invoice?.invoice_id,
      referenceNumber: order.number,
      lineItems: salesorder.line_items,
      wooItems: order.line_items,
      createdAt: new Date(),
    });

    await client.close();
  }

  @Step(12)
  async notify() {
    const order = this.payload;
    const { salesorder } = await this.getResult('createOrder');
    const customer = await this.getResult('ensureInventoryCustomer');

    const payload = {
      text: `A new order has been received from ${this.getSource()} — ${new Intl.DateTimeFormat(
        'en-US',
        {
          hour: 'numeric',
          minute: 'numeric',
          hour12: true,
          timeZone: 'America/New_York',
          timeZoneName: 'short',
          day: 'numeric',
          month: 'short',
        },
      ).format(new Date(order.date_created))}.`,
      card: {
        title: `Order ${order.number} — Incoming Sale`,
        theme: 'modern-inline',
      },
      buttons: [
        {
          label: 'View in Inventory',
          hint: '',
          type: '+',
          action: {
            type: 'open.url',
            data: {
              web: `https://inventory.zoho.com/app/893457005#/salesorders/${salesorder.salesorder_id}`,
            },
          },
        },
      ],
      slides: [
        {
          type: 'label',
          title: 'Details',
          data: [
            { Customer: customer.email },
            { 'Order Total': `${order.total} ${order.currency}` },
          ],
        },
      ],
    };

    await this.zohoService.notifySubscribers({
      connection: 'miami_distro',
      topic: 'new_order',
      payload,
    });
  }

  @Step(13)
  async deleteAddresses() {
    const connection = this.getWooConnection();

    if (!Object.prototype.hasOwnProperty.call(this.customerIds, connection)) {
      return;
    }

    const customer = await this.getResult('ensureInventoryCustomer');

    const { billingAddressId, shippingAddressId } =
      await this.getResult('ensureAddresses');

    const addresses = [billingAddressId, shippingAddressId];

    for (const addressId of addresses) {
      try {
        await this.zohoService.delete(
          `/inventory/v1/contacts/${customer.contact_id}/address/${addressId}`,
          {
            connection: 'miami_distro',
            params: {
              organization_id: '893457005',
            },
          },
        );
      } catch {
        // Ignore
      }
    }
  }
}
