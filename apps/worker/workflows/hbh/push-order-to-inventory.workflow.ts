import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import mongodb from 'mongodb';

const MongoClient = mongodb.MongoClient;

@Workflow({
  webhook: true,
  name: 'HHB - Push BigCommerce Order to Inventory',
})
export class PushOrderToInventoryWorkflow extends WorkflowBase<
  Record<string, any>,
  { runs: number }
> {
  constructor(
    private readonly bigCommerceService: BigCommerceService,
    private readonly zohoService: ZohoService,
    private readonly envService: EnvService,
  ) {
    super();
  }

  setName(obj) {
    if (!obj) {
      return obj;
    }

    let firstName = (obj.first_name ?? obj.firstName)?.trim();
    let lastName = (obj.last_name ?? obj.lastName)?.trim();

    if (!firstName) {
      firstName = '';
    }

    if (!lastName) {
      lastName = '';
    } else {
      lastName = ` ${lastName}`;
    }

    obj.name = `${firstName}${lastName}`;

    return obj;
  }

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
      .then((r) => r.data);
  }

  async fetchCustomerAndContactPerson(
    db,
    contactPersonFilter,
    customerFilter,
    bigCommerceCustomer,
  ) {
    let contactPersons = await db
      .collection('contact_person')
      .find(contactPersonFilter)
      .toArray();

    if (contactPersons.length === 0 && !customerFilter) {
      return null;
    }

    let customers = await db
      .collection('customer')
      .find({
        id: {
          $in: contactPersons.map((c) => c.customerId),
        },
        ...(customerFilter ?? {}),
      })
      .toArray();

    if (customers.length === 0) {
      customers = await db
        .collection('customer')
        .find({
          id: {
            $in: contactPersons.map((c) => c.customerId),
          },
        })
        .toArray();
    }

    const customer = customers[0];

    if (customer && contactPersons.length === 0 && bigCommerceCustomer) {
      const _contactPersons = await db
        .collection('contact_person')
        .find({
          customerId: customer.id,
        })
        .toArray();

      contactPersons = _contactPersons.filter(
        (c) =>
          c.firstName === bigCommerceCustomer.first_name &&
          c.lastName === bigCommerceCustomer.last_name,
      );

      if (contactPersons.length === 0) {
        contactPersons = _contactPersons.filter((c) => c.isPrimary);
      }

      if (contactPersons.length === 0) {
        contactPersons = _contactPersons;
      }

      contactPersons.sort((c) => (c.isPrimary ? -1 : 1));
    }

    return {
      contactPerson: contactPersons.find((c) => c.customerId === customer.id),
      customer,
    };
  }

  async importAccountToBooks(accountId) {
    try {
      const { data: booksResponse } = await this.zohoService.post(
        `/books/v3/crm/account/${accountId}/import`,
        {},
        {
          connection: 'hbh',
          url: `/books/v3/crm/account/${accountId}/import`,
          params: {
            organization_id: '776003162',
          },
        },
      );

      const { data: inventoryResponse } = await this.zohoService.put(
        `/inventory/v1/contacts/${booksResponse.data.customer_id}`,
        {
          tax_authority_id: '3195387000000528007',
          tax_exemption_id: '3195387000000555440',
          tax_authority_name: 'Business Wholesale',
          tax_exemption_code: 'BUSINESS',
          is_taxable: false,
        },
        {
          connection: 'hbh',
          params: {
            organization_id: '776003162',
          },
        },
      );

      return inventoryResponse.contact;
    } catch (e) {
      console.log(e.response?.data ?? e);
      throw new Error(`Could not import Account into Books`);
    }
  }

  compareObjects(a, b, excludeKeys = []) {
    const keys = Object.keys(a).filter((k) => !excludeKeys.includes(k));
    const match = {
      matched: [],
      mismatched: [],
      percentage: 0,
    };

    for (const key of keys) {
      const types = new Set([typeof a[key], typeof b[key]]);

      let v1;
      let v2;

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

  findMostSimilarObject(ref, objects, excludeKeys = []) {
    const map = objects.map((object) => ({
      object,
      ref,
      match: this.compareObjects(ref, object, excludeKeys),
    }));

    map.sort((a, b) => b.match.percentage - a.match.percentage);

    return objects.length === 0
      ? {
          object: null,
          ref,
          match: {
            matched: [],
            mismatched: [],
            percentage: 0,
          },
        }
      : map[0];
  }

  async fetchMongoDBAddresses(db, customerId) {
    let addressesRaw = await db
      .collection('address')
      .find({
        customerId: customerId,
      })
      .toArray();

    return addressesRaw.map((a) =>
      this.setName({
        address_id: a.id,
        first_name: a.firstName,
        last_name: a.lastName,
        city: a.city,
        country_iso2: a.countryCode,
        zip: a.zip,
        state: a.state,
        street_1: a.address,
        street_2: a.street2,
        phone: a.phone,
      }),
    );
  }

  async createWishList(channel, order, contactPerson) {
    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db(channel);

    const {
      data: { data: wishlist },
    } = await this.bigCommerceService.post(
      '/v3/wishlists',
      {
        customer_id: order.customer_id,
        name: 'Reorder List',
        is_public: false,
        items: Array.from(new Set(order.products.map((p) => p.product_id))).map(
          (product_id) => ({
            product_id,
          }),
        ),
      },
      {
        connection: channel,
      },
    );

    await db.collection('contact_person').updateOne(
      {
        id: contactPerson.id,
      },
      {
        $set: {
          reorderWishlistId: wishlist.id,
        },
      },
    );

    await client.close();

    return wishlist;
  }

  @Step(1)
  async fetchData() {
    const channel =
      this.payload.producer === 'stores/to8tttzuxj' ? 'hbh' : 'dispomart';

    const { data: bigCommerceOrder } = await this.bigCommerceService.get(
      `/v2/orders/${this.payload.data.id}`,
      {
        connection: channel,
      },
    );

    if (
      bigCommerceOrder.payment_status === 'declined' &&
      bigCommerceOrder.payment_status === 'void'
    ) {
      return this.cancel('Payment has been declined or voided');
    }

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db(channel);

    if (
      bigCommerceOrder.status === 'Incomplete' ||
      bigCommerceOrder.status === 'Pending'
    ) {
      if (this.context && this.context.runs > 24 * 3) {
        await client.close();
        return this.cancel(
          "It's been 3 days and the order is still incomplete, so skipping it.",
        );
      }

      await this.setContext({
        runs: (this.context?.runs ?? 0) + 1,
      });
      this.rerun(1000 * 60 * 60); // rerun after 1 hour

      const token = await this.workflowService.getJobToken(this.dbJob.id);

      await db.collection('bigcommerce_incomplete_order').insertOne({
        id: bigCommerceOrder.id,
        cancelURL: `${this.envService.getString('APP_URL')}/api/jobs/${this.dbJob.id}/cancel?token=${token}`,
        resumeURL: `${this.envService.getString('APP_URL')}/api/jobs/${this.dbJob.id}/resume?token=${token}`,
      });

      await client.close();

      return 'The order is incomplete, so waiting for the customer to complete it.';
    }

    const {
      data: { data: bigCommerceCustomers },
    } = await this.bigCommerceService.get('/v3/customers', {
      connection: channel,
      params: {
        'id:in': bigCommerceOrder.customer_id,
      },
    });

    const bigCommerceCustomer = this.setName(bigCommerceCustomers[0]);

    bigCommerceOrder.products = [];
    bigCommerceOrder.shipping_addresses = [];

    for (let page = 1; true; page++) {
      const { data: result } = await this.bigCommerceService.get(
        `/v2/orders/${this.payload.data.id}/products`,
        {
          connection: channel,
          params: {
            page,
            limit: 50,
          },
        },
      );

      bigCommerceOrder.products.push(...result);

      if (result.length < 50) {
        break;
      }
    }

    for (let page = 1; true; page++) {
      const { data: result } = await this.bigCommerceService.get(
        `/v2/orders/${this.payload.data.id}/shipping_addresses`,
        {
          connection: channel,
          params: {
            page,
            limit: 50,
          },
        },
      );

      bigCommerceOrder.shipping_addresses.push(...result);

      if (result.length < 50) {
        break;
      }
    }

    bigCommerceOrder.shipping_addresses.forEach(this.setName);
    this.setName(bigCommerceOrder.billing_address);

    const items = await client
      .db('hbh')
      .collection('item')
      .find({
        sku: {
          $in: Array.from(new Set(bigCommerceOrder.products.map((p) => p.sku))),
        },
      })
      .toArray();

    for (const product of bigCommerceOrder.products) {
      product.inventory_item = items.find((i) => i.sku === product.sku);
    }

    const group = await db.collection('customer_group').findOne({
      bigCommerceId: bigCommerceCustomer.customer_group_id,
    });

    await client.close();

    const { data: metafields } = await this.bigCommerceService.get(
      `/v3/customers/${bigCommerceCustomer.id}/metafields`,
      {
        connection: channel,
      },
    );

    const salesPersonRaw = metafields.data.find(
      (i) => i.namespace === 'Sales' && i.key === 'Sales Person',
    )?.value;
    const salesPerson = salesPersonRaw ? JSON.parse(salesPersonRaw) : null;

    const customerNumberRaw = metafields.data.find(
      (i) => i.namespace === 'Sales' && i.key === 'Customer Number',
    )?.value;
    const customerNumber = customerNumberRaw ? customerNumberRaw : null;

    return {
      bigCommerceCustomer,
      bigCommerceOrder,
      customerNumber,
      salesPerson,
      channel,
      group,
    };
  }

  @Step(2)
  async ensureCustomer() {
    const { bigCommerceCustomer } = await this.getResult('fetchData');

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db('hbh');

    let customerAndContactPerson = await this.fetchCustomerAndContactPerson(
      db,
      {
        email: bigCommerceCustomer.email,
        isActive: true,
      },
      {
        company: bigCommerceCustomer.company,
        isActive: true,
      },
      bigCommerceCustomer,
    );

    if (
      customerAndContactPerson?.contactPerson &&
      customerAndContactPerson?.customer
    ) {
      await client.close();

      return customerAndContactPerson;
    }

    const contactResult = await this.queryCRM(
      `select Account_Name.id as accountId, Account_Name.Customer_Type as type from Contacts where ${bigCommerceCustomer.customerNumber ? `(Customer_Number = '${bigCommerceCustomer.customerNumber}') ` : ''}(Email = '${bigCommerceCustomer.email}' or Removed_Email = '${bigCommerceCustomer.email}') or (Account_Name.Account_Name = '${bigCommerceCustomer.company.replaceAll("'", "''")}' and First_Name = '${bigCommerceCustomer.first_name.replaceAll("'", "''")}')`,
    );

    if (!contactResult?.data?.length) {
      throw new Error(
        `Failed to fetch contact from CRM using Email: ${bigCommerceCustomer.email}`,
      );
    }

    const { accountId } = contactResult.data[0];

    if (!accountId) {
      throw new Error(
        `Contact is not associated with any Business Account in CRM`,
      );
    }

    if (contactResult.type !== 'business') {
      await this.zohoService.put(
        `/crm/v8/Accounts`,
        {
          data: [
            {
              id: accountId,
              Customer_Type: 'business',
            },
          ],
        },
        {
          connection: 'hbh',
        },
      );
    }

    const inventoryCustomer = await this.importAccountToBooks(accountId);

    await db.collection('customer').updateOne(
      { id: inventoryCustomer.contact_id },
      {
        $set: {
          id: inventoryCustomer.contact_id,
          company: inventoryCustomer.company_name,
          group: inventoryCustomer.cf_bigcommerce_customer_group?.trim(),
          firstName: inventoryCustomer.first_name,
          lastName: inventoryCustomer.last_name,
          email: inventoryCustomer.email,
          phone: inventoryCustomer.phone,
          mobile: inventoryCustomer.mobile,
        },
      },
      { upsert: true },
    );

    await db.collection('contact_person').bulkWrite(
      inventoryCustomer.contact_persons.map((c) => ({
        updateOne: {
          filter: { email: c.email },
          update: {
            $set: {
              id: c.contact_person_id,
              customerId: inventoryCustomer.contact_id,
              firstName: c.first_name,
              lastName: c.last_name,
              email: c.email,
              phone: c.phone,
              mobile: c.mobile,
              isPrimary: c.is_primary_contact,
              hasAccount: bigCommerceCustomer.email === c.email,
            },
          },
          upsert: true,
        },
      })),
    );

    customerAndContactPerson = await this.fetchCustomerAndContactPerson(
      db,
      {
        email: bigCommerceCustomer.email,
      },
      {
        id: inventoryCustomer.contact_id,
      },
      bigCommerceCustomer,
    );

    await client.close();

    return customerAndContactPerson;
  }

  @Step(3)
  async ensureAddresses() {
    const { bigCommerceOrder } = await this.getResult('fetchData');
    const { customer } = await this.getResult('ensureCustomer');

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db('hbh');

    const { shipping_addresses } = bigCommerceOrder;
    const { billing_address } = bigCommerceOrder;

    let addresses = await this.fetchMongoDBAddresses(db, customer.id);

    const billingAddress = {
      first_name: billing_address.first_name,
      last_name: billing_address.last_name,
      name: billing_address.name,
      city: billing_address.city,
      country_iso2: billing_address.country_iso2,
      zip: billing_address.zip,
      state: billing_address.state,
      street_1: billing_address.street_1,
      street_2: billing_address.street_2,
      phone: billing_address.phone,
    };

    const shippingAddresses = shipping_addresses.map((sa) =>
      this.setName({
        first_name: sa.first_name,
        last_name: sa.last_name,
        city: sa.city,
        country_iso2: sa.country_iso2,
        zip: sa.zip,
        state: sa.state,
        street_1: sa.street_1,
        street_2: sa.street_2,
        phone: sa.phone,
      }),
    );

    const excludeMatchFields = ['first_name', 'last_name', 'address_id'];

    let billingAddressMatch = this.findMostSimilarObject(
      billingAddress,
      addresses,
      excludeMatchFields,
    );
    let shippingAddressMatches = shippingAddresses.map((sa) =>
      this.findMostSimilarObject(sa, addresses, excludeMatchFields),
    );

    const noBillingAddress =
      !billingAddressMatch || billingAddressMatch.match.percentage < 100;
    const noShippingAddress = shippingAddressMatches.some(
      (sa) => sa.match.percentage < 100,
    );

    if (noBillingAddress || noShippingAddress) {
      const addressesToCreate = [];

      if (noBillingAddress) {
        addressesToCreate.push({
          type: 'billing',
          source: billingAddress,
          info: {
            attention: billingAddress.name,
            address: billingAddress.street_1,
            street2: billingAddress.street_2,
            city: billingAddress.city,
            state: billing_address.state,
            zip: billingAddress.zip,
            country_code: billingAddress.country_iso2,
            phone: billingAddress.phone,
          },
        });
      }

      if (noShippingAddress) {
        for (const sa of shippingAddressMatches) {
          if (sa.matches > 100) {
            continue;
          }

          addressesToCreate.push({
            type: 'shipping',
            source: sa.ref,
            info: {
              attention: sa.ref.name,
              address: sa.ref.street_1,
              street2: sa.ref.street_2,
              city: sa.ref.city,
              state: sa.ref.state,
              zip: sa.ref.zip,
              country_code: sa.ref.country_iso2,
              phone: sa.ref.phone,
            },
          });
        }
      }

      const countries = await db
        .collection('inventory_countries')
        .find({
          code: {
            $in: addressesToCreate.map((a) => a.info.country_code),
          },
        })
        .toArray();

      for (const address of addressesToCreate) {
        const country = countries.find(
          (c) => c.code === address.info.country_code,
        );

        const { data: response } = await this.zohoService.post(
          `/inventory/v1/contacts/${customer.id}/address`,
          {
            ...address.info,
            country: country?.id,
          },
          {
            connection: 'hbh',
            params: {
              organization_id: '776003162',
            },
          },
        );

        await db.collection('address').insertOne({
          id: response.address_info.address_id,
          customerId: customer.id,
          firstName: address.source.first_name,
          lastName: address.source.last_name,
          address: address.source.street_1,
          street2: address.source.street_2,
          city: address.source.city,
          state: address.source.state,
          country: country?.id,
          countryCode: country?.code,
          phone: address.source.phone,
          zip: address.source.zip,
        });

        if (addressesToCreate.length > 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      addresses = await this.fetchMongoDBAddresses(db, customer.id);
      billingAddressMatch = this.findMostSimilarObject(
        billingAddress,
        addresses,
        excludeMatchFields,
      );
      shippingAddressMatches = shippingAddresses.map((sa) =>
        this.findMostSimilarObject(sa, addresses, excludeMatchFields),
      );
    }

    await client.close();

    return {
      billingAddress: billingAddressMatch.object,
      shippingAddresses: shippingAddressMatches
        .filter((m) => m.match.percentage === 100)
        .map((m) => ({
          bigCommerceAddress: m.ref,
          inventoryAddress: m.object,
        })),
    };
  }

  @Step(4)
  async createOrder() {
    const { bigCommerceOrder, salesPerson, group, channel } =
      await this.getResult('fetchData');
    const { billingAddress, shippingAddresses } =
      await this.getResult('ensureAddresses');
    const { contactPerson } = await this.getResult('ensureCustomer');

    const nonsenseSKUs = bigCommerceOrder.products
      .filter((p) => !p.inventory_item)
      .map((p) => p.sku);

    if (nonsenseSKUs.length > 0) {
      return this.cancel({
        message: `The following SKUs don't exist in Zoho Inventory: ${nonsenseSKUs.join(', ')}`,
        skus: nonsenseSKUs,
      });
    }

    const createOrder = async () => {
      const price = bigCommerceOrder.products.reduce(
        (a, b) => a + Number(b.price_ex_tax) * b.quantity,
        0,
      );

      const discountedPrice = bigCommerceOrder.products.reduce(
        (a, b) => a + Number(b.discounted_total_inc_tax),
        0,
      );

      return await this.zohoService
        .post(
          `/inventory/v1/salesorders`,
          {
            customer_id: contactPerson.customerId,
            // pricebook_id: "3195387000029936072",
            reference_number: `${channel === 'hbh' ? 'WS' : 'DM'}_Online_Order_${bigCommerceOrder.id}`,
            notes: bigCommerceOrder.customer_message,
            salesperson_name: salesPerson.name,
            pricebook_id: group?.pricelistId,
            shipping_charge: Number(bigCommerceOrder.shipping_cost_ex_tax),
            discount_type: 'entity_level',
            discount: (price - discountedPrice).toFixed(2),
            billing_address_id: billingAddress.address_id,
            shipping_address_id:
              shippingAddresses[0].inventoryAddress.address_id,
            location_id: '3195387000000247111',
            line_items: bigCommerceOrder.products
              .map((p) => ({
                item_id: p.inventory_item.id,
                quantity: p.quantity,
                rate: p.price_ex_tax,
                location_id: '3195387000000083052',
              }))
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
            connection: channel,
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

  @Step(5)
  async markOrderAsConfirmed() {
    const { bigCommerceOrder, channel } = await this.getResult('fetchData');
    const { salesorder } = await this.getResult('createOrder');

    const isInvoice =
      bigCommerceOrder.payment_method === 'Invoice' ||
      bigCommerceOrder.payment_method === 'Request Invoice';

    return await this.zohoService
      .post(
        `/inventory/v1/salesorders/${salesorder.salesorder_id}/${isInvoice && channel === 'dispomart' ? 'substatus/cs_dispoma' : 'status/confirmed'}`,
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

  @Step(6)
  async createInvoices() {
    const { bigCommerceOrder, salesPerson, group } =
      await this.getResult('fetchData');
    const { shippingAddresses } = await this.getResult('ensureAddresses');
    const { contactPerson } = await this.getResult('ensureCustomer');
    const { salesorder } = await this.getResult('createOrder');

    const results = [];

    const shippingAddressCount = bigCommerceOrder.shipping_address_count;
    const discountPerInvoice = salesorder.discount / shippingAddressCount;
    const shippingChargePerInvoice =
      salesorder.shipping_charge / shippingAddressCount;

    const remaining = {
      shippingCharge: 0,
      discount: 0,
    };

    const saWithProductsAndTotal = bigCommerceOrder.shipping_addresses.map(
      (sa) => {
        const products = bigCommerceOrder.products.filter(
          (p, i) =>
            p.order_address_id === sa.id ||
            (p.order_address_id === 0 && i === 0),
        );
        const totalPrice = products.reduce(
          (a, b) => a + b.quantity * Number(b.price_ex_tax),
          0,
        );

        return {
          sa,
          products,
          totalPrice,
        };
      },
    );

    saWithProductsAndTotal.sort((a, b) => a.totalPrice - b.totalPrice);

    for (const { sa, products, totalPrice } of saWithProductsAndTotal) {
      const shippingAddress = shippingAddresses.find(
        ({ inventoryAddress: s }) =>
          s.first_name === sa.first_name &&
          s.last_name === sa.last_name &&
          s.city === sa.city &&
          s.zip === sa.zip &&
          (!s.street_1 || s.street_1 === sa.street_1) &&
          (!s.street_2 || s.street_2 === sa.street_2) &&
          (!s.phone || s.phone === sa.phone),
      );
      let discount = remaining.discount + discountPerInvoice;
      let shippingCharge = remaining.shippingCharge + shippingChargePerInvoice;

      if (discount > totalPrice) {
        remaining.discount = discount - totalPrice;
        discount = totalPrice;
      } else {
        remaining.discount = 0;
      }

      if (shippingCharge > totalPrice) {
        remaining.shippingCharge = shippingCharge - totalPrice;
        shippingCharge = totalPrice;
      } else {
        remaining.shippingCharge = 0;
      }

      const lineItems = products
        .map((p) => ({
          item_id: p.inventory_item.id,
          quantity: Number(p.quantity),
          rate: p.price_ex_tax,
          location_id: '3195387000000083052',
        }))
        .reduce((a, b) => {
          const existing = a.find((i) => i.item_id === b.item_id);

          if (existing) {
            existing.quantity += b.quantity;
          } else {
            const orderLineItem = salesorder.line_items.find(
              (i) => i.item_id === b.item_id,
            );

            b.salesorder_item_id = orderLineItem.line_item_id;

            a.push(b);
          }

          return a;
        }, []);

      const { data: result } = await this.zohoService.post(
        `/inventory/v1/invoices`,
        {
          customer_id: contactPerson.customerId,
          reference_number: salesorder.reference_number,
          template_id: '3195387000000842128',
          shipping_charge: shippingCharge,
          salesperson_name: salesPerson.name,
          pricebook_id: group?.pricelistId,
          date: salesorder.date,
          due_date: salesorder.date,
          is_inclusive_tax: false,
          discount: discount,
          discount_type: salesorder.discount_type,
          billing_address_id: salesorder.billing_address_id,
          shipping_address_id: shippingAddress.inventoryAddress.address_id,
          location_id: salesorder.location_id,
          line_items: lineItems,
          custom_fields: [
            {
              value: sa.shipping_method,
              customfield_id: '3195387000070570782',
            },
          ],
        },
        {
          connection: 'hbh',
          params: {
            organization_id: '776003162',
            ignore_auto_number_generation: false,
          },
        },
      );

      results.push(result);
    }

    this.delay(1000 * 10); // wait for 10 seconds to let zoho update inventory

    return results;
  }

  @Step(7)
  async markInvoiceAsPaid() {
    const { bigCommerceOrder } = await this.getResult('fetchData');
    const invoices = await this.getResult('createInvoices').then((invoices) =>
      invoices.map((i) => i.invoice),
    );
    const { contactPerson } = await this.getResult('ensureCustomer');

    const paymentResults = [];
    const sentResults = [];

    for (const invoice of invoices) {
      const { data: sentResult } = await this.zohoService.post(
        `/inventory/v1/invoices/${invoice.invoice_id}/status/sent`,
        {},
        {
          connection: 'hbh',
          params: {
            organization_id: '776003162',
          },
        },
      );

      sentResults.push(sentResult);

      const paymentMethod = bigCommerceOrder.payment_method;

      if (
        invoice.total <= 0 ||
        paymentMethod === 'Invoice' ||
        paymentMethod === 'Request Invoice'
      ) {
        continue;
      }

      const { data: paymentResult } = await this.zohoService.post(
        `/inventory/v1/customerpayments`,
        {
          customer_id: contactPerson.customerId,
          payment_mode:
            bigCommerceOrder.payment_method === 'Authorize.Net'
              ? 'Authorize.Net'
              : 'creditcard',
          date: invoice.date,
          amount: invoice.total,
          account_id: '3195387000000000358',
          reference_number: bigCommerceOrder.payment_provider_id,
          invoices: [
            {
              invoice_id: invoice.invoice_id,
              amount_applied: invoice.total,
            },
          ],
        },
        {
          connection: 'hbh',
          params: {
            organization_id: '776003162',
          },
        },
      );

      paymentResults.push(paymentResult);
    }

    return {
      sentResults,
      paymentResults,
    };
  }

  @Step(8)
  async storeOrderInMongo() {
    const { bigCommerceOrder, channel } = await this.getResult('fetchData');
    const { salesorder } = await this.getResult('createOrder');

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db(channel);

    const inventoryOrderId = salesorder.salesorder_id;
    const bigCommerceOrderId = bigCommerceOrder.id.toString();

    const result = await db.collection('order').updateOne(
      {
        bigCommerceOrderId: {
          $eq: bigCommerceOrderId,
        },
      },
      {
        $set: {
          inventoryOrderId,
          bigCommerceOrderId,
          items: bigCommerceOrder.products.map((p) => ({
            sku: p.sku,
            bigCommerceLineItemId: p.id,
            bigCommerceProductId: p.product_id,
            bigCommerceVariantId: p.variant_id,
            inventoryItemId: p.inventory_item.id,
            quantity: p.quantity,
          })),
        },
      },
      {
        upsert: true,
      },
    );

    await client.close();

    return result;
  }

  @Step(9)
  async updateReorderList() {
    const { bigCommerceOrder, channel } = await this.getResult('fetchData');
    const { contactPerson } = await this.getResult('ensureCustomer');
    let { reorderWishlistId } = contactPerson;

    if (!reorderWishlistId) {
      return this.createWishList(channel, bigCommerceOrder, contactPerson);
    }

    try {
      const {
        data: { data: wishlist },
      } = await this.bigCommerceService.post(
        `/v3/wishlists/${reorderWishlistId}/items`,
        {
          items: Array.from(
            new Set(bigCommerceOrder.products.map((p) => p.product_id)),
          ).map((product_id) => ({
            product_id,
          })),
        },
        {
          connection: channel,
        },
      );

      return wishlist;
    } catch (e) {
      return this.createWishList(channel, bigCommerceOrder, contactPerson);
    }
  }
}
