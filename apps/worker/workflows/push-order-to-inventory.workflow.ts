import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import mongodb from 'mongodb';

const MongoClient = mongodb.MongoClient;

@Workflow({
  webhook: true,
  name: 'Push BigCommerce Order to Inventory',
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
      if (this.context.runs > 1) {
        await client.close();
        return this.cancel(
          "It's been 3 days and the order is still incomplete, so skipping it.",
        );
      }

      this.rerun(259200000);

      const token = await this.workflowService.getJobToken(this.dbJob.id);

      await db.collection('bigcommerce_incomplete_order').insertOne({
        id: bigCommerceOrder.id,
        cancelURL: `${this.envService.getString('APP_URL')}/api/jobs/${this.dbJob.id}/cancel?token=${token}`,
        resumeURL: `${this.envService.getString('APP_URL')}/api/jobs/${this.dbJob.id}/resume?token=${token}`,
      });

      await client.close();

      return this.cancel(
        'The order is incomplete, so waiting for the customer to complete it.',
      );
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
    return {
      contactPerson: {
        _id: '66f4ff6dec5829dcea03030d',
        id: '3195387000059049939',
        customerId: '3195387000000546623',
        firstName: 'Andrew',
        lastName: 'Stoddard',
        email: '',
        phone: '',
        mobile: '+17742722219',
        isActive: true,
        reorderWishlistId: 467,
      },
      customer: {
        _id: '66f4fa64ec5829dcea02900b',
        id: '3195387000000546623',
        company: 'Fat Ass Glass',
        group: 'Wholesale-Grandfathered_Master_Distro',
        firstName: 'Andrew',
        lastName: 'Stoddard',
        email: 'fatassglassco@gmail.com',
        phone: '',
        mobile: '+1 (774) 272-2219',
        isActive: true,
      },
    };

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

    console.log(contactResult);

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

      return await this.zohoService.post(
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
          shipping_address_id: shippingAddresses[0].inventoryAddress.address_id,
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
      );
    };

    // return await createOrder();

    return {
      code: 0,
      message: 'Sales Order has been created.',
      salesorder: {
        salesorder_id: '3195387000181333750',
        is_viewed_in_mail: false,
        mail_first_viewed_time: '',
        mail_first_viewed_time_formatted: '',
        mail_last_viewed_time: '',
        mail_last_viewed_time_formatted: '',
        documents: [],
        zcrm_potential_id: '',
        zcrm_potential_name: '',
        salesorder_number: 'SO-42877',
        date: '2025-09-26',
        date_formatted: '09.26.25',
        offline_created_date_with_time: '',
        offline_created_date_with_time_formatted: '',
        tracking_url: '',
        has_discount: false,
        status: 'draft',
        status_formatted: 'Draft',
        color_code: '',
        current_sub_status_id: '',
        current_sub_status: 'draft',
        current_sub_status_formatted: 'Draft',
        sub_statuses: [
          {
            status_id: '3195387000084679002',
            status_code: 'cs_backord',
            parent_status: 'draft',
            parent_status_formatted: 'Draft',
            description: '',
            display_name: 'Back Order',
            label_name: 'cs_backord',
            color_code: '3D5550',
          },
          {
            status_id: '3195387000093516852',
            status_code: 'cs_wsaband',
            parent_status: 'draft',
            parent_status_formatted: 'Draft',
            description: 'HBH wholesale site abandoned cart. ',
            display_name: 'WS Abandon Cart',
            label_name: 'cs_wsaband',
            color_code: '959bb6',
          },
        ],
        order_sub_status_id: '',
        invoiced_sub_status_id: '',
        shipped_sub_status_id: '',
        order_sub_status: '',
        order_sub_status_formatted: '',
        invoiced_sub_status: '',
        invoiced_sub_status_formatted: '',
        shipped_sub_status: '',
        shipped_sub_status_formatted: '',
        shipment_date: '',
        shipment_date_formatted: '',
        reference_number: 'WS_Online_Order_491',
        customer_id: '3195387000000546623',
        customer_name: 'Fat Ass Glass',
        contact_persons: [],
        contact_persons_associated: [],
        contact_person_details: [
          {
            phone: '',
            mobile: '+1 (774) 272-2219',
            last_name: 'Stoddard',
            contact_person_id: '3195387000000546625',
            first_name: 'Andrew',
            email: 'fatassglassco@gmail.com',
          },
        ],
        source: 'Api',
        contact_category: '',
        is_taxable: false,
        tax_authority_id: '3195387000000528007',
        tax_exemption_id: '3195387000000555440',
        tax_authority_name: 'Business Wholesale',
        tax_exemption_code: 'BUSINESS',
        has_shipping_address: true,
        currency_id: '3195387000000000097',
        currency_code: 'USD',
        currency_symbol: '$',
        exchange_rate: 1,
        is_discount_before_tax: true,
        discount_type: 'entity_level',
        estimate_id: '',
        delivery_method: '',
        delivery_method_id: '',
        is_inclusive_tax: false,
        tax_rounding: 'entity_level',
        tax_override_preference: 'no_override',
        order_status: 'draft',
        order_status_formatted: 'Draft',
        invoiced_status: '',
        invoiced_status_formatted: '',
        paid_status: '',
        paid_status_formatted: '',
        shipped_status: '',
        shipped_status_formatted: '',
        sales_channel: 'direct_sales',
        sales_channel_formatted: 'Direct Sales',
        account_identifier: '',
        integration_id: '',
        is_dropshipped: false,
        is_backordered: false,
        is_manually_fulfilled: false,
        can_manually_fulfill: false,
        has_qty_cancelled: false,
        shipping_details: {},
        created_by_email: 'josh@honeybeeherb.com',
        created_by_name: 'Josh Pfautz',
        branch_id: '3195387000000247111',
        branch_name: 'Organization Address',
        location_id: '3195387000000247111',
        location_name: 'Organization Address',
        total_quantity: 135,
        total_quantity_formatted: '135.00',
        line_items: [
          {
            line_item_id: '3195387000181333757',
            variant_id: '3195387000000139878',
            item_id: '3195387000000139878',
            is_returnable: true,
            product_id: '3195387000000139886',
            attribute_name1: 'Type',
            attribute_name2: 'Size',
            attribute_name3: '',
            attribute_option_name1: 'Male',
            attribute_option_name2: '14mm',
            attribute_option_name3: '',
            attribute_option_data1: '',
            attribute_option_data2: '',
            attribute_option_data3: '',
            is_combo_product: false,
            combo_type: '',
            combo_type_formatted: '',
            sku: 'QB85-14M',
            name: 'BEEHIVE - 90° DEGREE | YL/14mm Male',
            group_name: 'BEEHIVE - 90° DEGREE | YL',
            description: 'MSRP $29.99\n90° DEGREE',
            item_order: 1,
            bcy_rate: 5.18,
            bcy_rate_formatted: '$5.18',
            rate: 5.18,
            rate_formatted: '$5.18',
            label_rate: '',
            label_rate_formatted: '',
            sales_rate: 10,
            sales_rate_formatted: '$10.00',
            quantity: 50,
            quantity_manuallyfulfilled: 0,
            unit: 'pcs',
            pricebook_id: '',
            header_id: '',
            header_name: '',
            discount: 0,
            discounts: [],
            tax_id: '',
            tax_name: '',
            tax_type: 'tax',
            tax_percentage: 0,
            line_item_taxes: [],
            tax_exemption_id: '3195387000000555440',
            tax_exemption_code: 'BUSINESS',
            tax_category_code: '',
            tax_category_name: '',
            product_tax_category: {
              tax_category_code: '',
              tax_category_name: '',
              description: '',
            },
            item_total: 259,
            item_total_formatted: '$259.00',
            item_sub_total: 259,
            item_sub_total_formatted: '$259.00',
            product_type: 'goods',
            line_item_type: 'goods',
            item_type: 'inventory',
            item_type_formatted: 'Inventory Items',
            is_invoiced: false,
            is_unconfirmed_product: false,
            tags: [],
            image_name:
              'Beehive-Quartz-Banger-90-Degree-YL-Main-White-BG_1280x.jpg',
            image_type: 'jpg',
            image_document_id: '3195387000000559817',
            document_id: '3195387000027655893',
            item_custom_fields: [
              {
                field_id: '3195387000007019025',
                customfield_id: '3195387000007019025',
                show_in_store: false,
                show_in_portal: false,
                is_active: true,
                index: 1,
                label: 'MSRP',
                show_on_pdf: true,
                edit_on_portal: false,
                edit_on_store: false,
                api_name: 'cf_msrp',
                show_in_all_pdf: true,
                value_formatted: '29.99',
                search_entity: 'item',
                data_type: 'decimal',
                placeholder: 'cf_msrp',
                value: 29.99,
                is_dependent_field: false,
              },
              {
                field_id: '3195387000030923164',
                customfield_id: '3195387000030923164',
                show_in_store: false,
                show_in_portal: false,
                is_active: true,
                index: 2,
                label: 'GS1 UPC Number',
                show_on_pdf: true,
                edit_on_portal: false,
                edit_on_store: false,
                api_name: 'cf_gs1_upc_number',
                show_in_all_pdf: true,
                value_formatted: '785366938104',
                search_entity: 'item',
                data_type: 'number',
                placeholder: 'cf_gs1_upc_number',
                value: '785366938104',
                is_dependent_field: false,
              },
            ],
            custom_field_hash: {
              cf_msrp: '29.99',
              cf_msrp_unformatted: 29.99,
              cf_gs1_upc_number: '785366938104',
              cf_gs1_upc_number_unformatted: '785366938104',
            },
            quantity_invoiced: 0,
            quantity_packed: 0,
            quantity_shipped: 0,
            quantity_picked: 0,
            quantity_backordered: 0,
            quantity_dropshipped: 0,
            quantity_cancelled: 0,
            quantity_delivered: 0,
            package_details: {
              length: 6,
              width: 4,
              height: 1.5,
              weight: 1.2,
              weight_unit: 'oz',
              dimension_unit: 'in',
            },
            quantity_invoiced_cancelled: 0,
            quantity_returned: 0,
            is_fulfillable: 0,
            project_id: '',
            location_id: '3195387000000083052',
            location_name: 'Honeybee Herb Tampa (Live) (Warehouse)*',
            mapped_items: [],
          },
          {
            line_item_id: '3195387000181333759',
            variant_id: '3195387000000128886',
            item_id: '3195387000000128886',
            is_returnable: true,
            product_id: '3195387000000128894',
            attribute_name1: 'Size',
            attribute_name2: 'Type',
            attribute_name3: '',
            attribute_option_name1: '14mm',
            attribute_option_name2: 'Male',
            attribute_option_name3: '',
            attribute_option_data1: '',
            attribute_option_data2: '',
            attribute_option_data3: '',
            is_combo_product: false,
            combo_type: '',
            combo_type_formatted: '',
            sku: 'QB95-14M',
            name: 'HONEYSUCKLE BEVEL - 90° DEGREE | YL/14mm / Male',
            group_name: 'HONEYSUCKLE BEVEL - 90° DEGREE | YL',
            description: 'MSRP $29.99\n90° DEGREE',
            item_order: 2,
            bcy_rate: 5.75,
            bcy_rate_formatted: '$5.75',
            rate: 5.75,
            rate_formatted: '$5.75',
            label_rate: '',
            label_rate_formatted: '',
            sales_rate: 10,
            sales_rate_formatted: '$10.00',
            quantity: 30,
            quantity_manuallyfulfilled: 0,
            unit: 'pcs',
            pricebook_id: '',
            header_id: '',
            header_name: '',
            discount: 0,
            discounts: [],
            tax_id: '',
            tax_name: '',
            tax_type: 'tax',
            tax_percentage: 0,
            line_item_taxes: [],
            tax_exemption_id: '3195387000000555440',
            tax_exemption_code: 'BUSINESS',
            tax_category_code: '',
            tax_category_name: '',
            product_tax_category: {
              tax_category_code: '',
              tax_category_name: '',
              description: '',
            },
            item_total: 172.5,
            item_total_formatted: '$172.50',
            item_sub_total: 172.5,
            item_sub_total_formatted: '$172.50',
            product_type: 'goods',
            line_item_type: 'goods',
            item_type: 'inventory',
            item_type_formatted: 'Inventory Items',
            is_invoiced: false,
            is_unconfirmed_product: false,
            tags: [],
            image_name:
              'honeysuckle-bevel-90-degree-quartz-banger-yellow-packaging.jpg',
            image_type: 'jpg',
            image_document_id: '3195387000047345223',
            document_id: '3195387000047345223',
            item_custom_fields: [
              {
                field_id: '3195387000007019025',
                customfield_id: '3195387000007019025',
                show_in_store: false,
                show_in_portal: false,
                is_active: true,
                index: 1,
                label: 'MSRP',
                show_on_pdf: true,
                edit_on_portal: false,
                edit_on_store: false,
                api_name: 'cf_msrp',
                show_in_all_pdf: true,
                value_formatted: '29.99',
                search_entity: 'item',
                data_type: 'decimal',
                placeholder: 'cf_msrp',
                value: 29.99,
                is_dependent_field: false,
              },
              {
                field_id: '3195387000030923164',
                customfield_id: '3195387000030923164',
                show_in_store: false,
                show_in_portal: false,
                is_active: true,
                index: 2,
                label: 'GS1 UPC Number',
                show_on_pdf: true,
                edit_on_portal: false,
                edit_on_store: false,
                api_name: 'cf_gs1_upc_number',
                show_in_all_pdf: true,
                value_formatted: '785366938708',
                search_entity: 'item',
                data_type: 'number',
                placeholder: 'cf_gs1_upc_number',
                value: '785366938708',
                is_dependent_field: false,
              },
            ],
            custom_field_hash: {
              cf_msrp: '29.99',
              cf_msrp_unformatted: 29.99,
              cf_gs1_upc_number: '785366938708',
              cf_gs1_upc_number_unformatted: '785366938708',
            },
            quantity_invoiced: 0,
            quantity_packed: 0,
            quantity_shipped: 0,
            quantity_picked: 0,
            quantity_backordered: 0,
            quantity_dropshipped: 0,
            quantity_cancelled: 0,
            quantity_delivered: 0,
            package_details: {
              length: 6,
              width: 4,
              height: 1.5,
              weight: 1,
              weight_unit: 'oz',
              dimension_unit: 'in',
            },
            quantity_invoiced_cancelled: 0,
            quantity_returned: 0,
            is_fulfillable: 0,
            project_id: '',
            location_id: '3195387000000083052',
            location_name: 'Honeybee Herb Tampa (Live) (Warehouse)*',
            mapped_items: [],
          },
          {
            line_item_id: '3195387000181333761',
            variant_id: '3195387000000120213',
            item_id: '3195387000000120213',
            is_returnable: true,
            product_id: '3195387000000120223',
            attribute_name1: 'Size',
            attribute_name2: 'Type',
            attribute_name3: '',
            attribute_option_name1: '14mm',
            attribute_option_name2: 'Male',
            attribute_option_name3: '',
            attribute_option_data1: '',
            attribute_option_data2: '',
            attribute_option_data3: '',
            is_combo_product: false,
            combo_type: '',
            combo_type_formatted: '',
            sku: 'QB76-14M',
            name: 'WHITE BUCKET/14mm / Male',
            group_name: 'WHITE BUCKET',
            description: 'MSRP $19.99\n90° DEGREE',
            item_order: 3,
            bcy_rate: 4.5,
            bcy_rate_formatted: '$4.50',
            rate: 4.5,
            rate_formatted: '$4.50',
            label_rate: '',
            label_rate_formatted: '',
            sales_rate: 7,
            sales_rate_formatted: '$7.00',
            quantity: 30,
            quantity_manuallyfulfilled: 0,
            unit: 'pcs',
            pricebook_id: '',
            header_id: '',
            header_name: '',
            discount: 0,
            discounts: [],
            tax_id: '',
            tax_name: '',
            tax_type: 'tax',
            tax_percentage: 0,
            line_item_taxes: [],
            tax_exemption_id: '3195387000000555440',
            tax_exemption_code: 'BUSINESS',
            tax_category_code: '',
            tax_category_name: '',
            product_tax_category: {
              tax_category_code: '',
              tax_category_name: '',
              description: '',
            },
            item_total: 135,
            item_total_formatted: '$135.00',
            item_sub_total: 135,
            item_sub_total_formatted: '$135.00',
            product_type: 'goods',
            line_item_type: 'goods',
            item_type: 'inventory',
            item_type_formatted: 'Inventory Items',
            is_invoiced: false,
            is_unconfirmed_product: false,
            tags: [],
            image_name: 'White Bucket.jpg',
            image_type: 'jpg',
            image_document_id: '3195387000000563490',
            document_id: '3195387000029259858',
            item_custom_fields: [
              {
                field_id: '3195387000007019025',
                customfield_id: '3195387000007019025',
                show_in_store: false,
                show_in_portal: false,
                is_active: true,
                index: 1,
                label: 'MSRP',
                show_on_pdf: true,
                edit_on_portal: false,
                edit_on_store: false,
                api_name: 'cf_msrp',
                show_in_all_pdf: true,
                value_formatted: '19.99',
                search_entity: 'item',
                data_type: 'decimal',
                placeholder: 'cf_msrp',
                value: 19.99,
                is_dependent_field: false,
              },
              {
                field_id: '3195387000030923164',
                customfield_id: '3195387000030923164',
                show_in_store: false,
                show_in_portal: false,
                is_active: true,
                index: 2,
                label: 'GS1 UPC Number',
                show_on_pdf: true,
                edit_on_portal: false,
                edit_on_store: false,
                api_name: 'cf_gs1_upc_number',
                show_in_all_pdf: true,
                value_formatted: '785366939897',
                search_entity: 'item',
                data_type: 'number',
                placeholder: 'cf_gs1_upc_number',
                value: '785366939897',
                is_dependent_field: false,
              },
            ],
            custom_field_hash: {
              cf_msrp: '19.99',
              cf_msrp_unformatted: 19.99,
              cf_gs1_upc_number: '785366939897',
              cf_gs1_upc_number_unformatted: '785366939897',
            },
            quantity_invoiced: 0,
            quantity_packed: 0,
            quantity_shipped: 0,
            quantity_picked: 0,
            quantity_backordered: 0,
            quantity_dropshipped: 0,
            quantity_cancelled: 0,
            quantity_delivered: 0,
            package_details: {
              length: 6,
              width: 4,
              height: 1.5,
              weight: 1,
              weight_unit: 'oz',
              dimension_unit: 'in',
            },
            quantity_invoiced_cancelled: 0,
            quantity_returned: 0,
            is_fulfillable: 0,
            project_id: '',
            location_id: '3195387000000083052',
            location_name: 'Honeybee Herb Tampa (Live) (Warehouse)*',
            mapped_items: [],
          },
          {
            line_item_id: '3195387000181333763',
            variant_id: '3195387000042453141',
            item_id: '3195387000042453141',
            is_returnable: true,
            product_id: '3195387000042453141',
            attribute_name1: '',
            attribute_name2: '',
            attribute_name3: '',
            attribute_option_name1: '',
            attribute_option_name2: '',
            attribute_option_name3: '',
            attribute_option_data1: '',
            attribute_option_data2: '',
            attribute_option_data3: '',
            is_combo_product: false,
            combo_type: '',
            combo_type_formatted: '',
            sku: 'Silicone/Plug-Set-Black',
            name: 'Bong & Rig Silicone Cleaning Plugs',
            group_name: 'Bong & Rig Silicone Cleaning Plugs',
            description: 'MSRP $9.99',
            item_order: 4,
            bcy_rate: 3.25,
            bcy_rate_formatted: '$3.25',
            rate: 3.25,
            rate_formatted: '$3.25',
            label_rate: '',
            label_rate_formatted: '',
            sales_rate: 5,
            sales_rate_formatted: '$5.00',
            quantity: 25,
            quantity_manuallyfulfilled: 0,
            unit: 'pcs',
            pricebook_id: '',
            header_id: '',
            header_name: '',
            discount: 0,
            discounts: [],
            tax_id: '',
            tax_name: '',
            tax_type: 'tax',
            tax_percentage: 0,
            line_item_taxes: [],
            tax_exemption_id: '3195387000000555440',
            tax_exemption_code: 'BUSINESS',
            tax_category_code: '',
            tax_category_name: '',
            product_tax_category: {
              tax_category_code: '',
              tax_category_name: '',
              description: '',
            },
            item_total: 81.25,
            item_total_formatted: '$81.25',
            item_sub_total: 81.25,
            item_sub_total_formatted: '$81.25',
            product_type: 'goods',
            line_item_type: 'goods',
            item_type: 'inventory',
            item_type_formatted: 'Inventory Items',
            is_invoiced: false,
            is_unconfirmed_product: false,
            tags: [],
            image_name: 'black-silicone-bong-and-rig-cleaning-plugs.jpg',
            image_type: 'jpg',
            image_document_id: '3195387000044102507',
            document_id: '3195387000044102507',
            item_custom_fields: [
              {
                field_id: '3195387000007019025',
                customfield_id: '3195387000007019025',
                show_in_store: false,
                show_in_portal: false,
                is_active: true,
                index: 1,
                label: 'MSRP',
                show_on_pdf: true,
                edit_on_portal: false,
                edit_on_store: false,
                api_name: 'cf_msrp',
                show_in_all_pdf: true,
                value_formatted: '9.99',
                search_entity: 'item',
                data_type: 'decimal',
                placeholder: 'cf_msrp',
                value: 9.99,
                is_dependent_field: false,
              },
              {
                field_id: '3195387000030923164',
                customfield_id: '3195387000030923164',
                show_in_store: false,
                show_in_portal: false,
                is_active: true,
                index: 2,
                label: 'GS1 UPC Number',
                show_on_pdf: true,
                edit_on_portal: false,
                edit_on_store: false,
                api_name: 'cf_gs1_upc_number',
                show_in_all_pdf: true,
                value_formatted: '785366940510',
                search_entity: 'item',
                data_type: 'number',
                placeholder: 'cf_gs1_upc_number',
                value: '785366940510',
                is_dependent_field: false,
              },
            ],
            custom_field_hash: {
              cf_msrp: '9.99',
              cf_msrp_unformatted: 9.99,
              cf_gs1_upc_number: '785366940510',
              cf_gs1_upc_number_unformatted: '785366940510',
            },
            quantity_invoiced: 0,
            quantity_packed: 0,
            quantity_shipped: 0,
            quantity_picked: 0,
            quantity_backordered: 0,
            quantity_dropshipped: 0,
            quantity_cancelled: 0,
            quantity_delivered: 0,
            package_details: {
              length: '',
              width: '',
              height: '',
              weight: 2,
              weight_unit: 'oz',
              dimension_unit: 'in',
            },
            quantity_invoiced_cancelled: 0,
            quantity_returned: 0,
            is_fulfillable: 0,
            project_id: '',
            location_id: '3195387000000083052',
            location_name: 'Honeybee Herb Tampa (Live) (Warehouse)*',
            mapped_items: [],
          },
        ],
        entity_tags: '',
        submitter_id: '',
        approver_id: '',
        submitted_date: '',
        submitted_date_formatted: '',
        submitted_by: '',
        submitted_by_name: '',
        submitted_by_email: '',
        submitted_by_photo_url: '',
        order_sub_statuses: [
          {
            status_id: '3195387000084679002',
            status_code: 'cs_backord',
            parent_status: 'draft',
            parent_status_formatted: 'Draft',
            description: '',
            display_name: 'Back Order',
            label_name: 'cs_backord',
            color_code: '3D5550',
          },
          {
            status_id: '3195387000092533173',
            status_code: 'cs_whitela',
            parent_status: 'confirmed',
            parent_status_formatted: 'Confirmed',
            description:
              'Used for White Label Orders that the customer has approved ',
            display_name: 'White Label Confirmed',
            label_name: 'cs_whitela',
            color_code: '903eff',
          },
          {
            status_id: '3195387000093516852',
            status_code: 'cs_wsaband',
            parent_status: 'draft',
            parent_status_formatted: 'Draft',
            description: 'HBH wholesale site abandoned cart. ',
            display_name: 'WS Abandon Cart',
            label_name: 'cs_wsaband',
            color_code: '959bb6',
          },
          {
            status_id: '3195387000093690538',
            status_code: 'cs_deposit',
            parent_status: 'confirmed',
            parent_status_formatted: 'Confirmed',
            description: 'Retainer Deposit Has Been Paid ',
            display_name: 'Deposit-WL',
            label_name: 'cs_deposit',
            color_code: '9CAC3F',
          },
          {
            status_id: '3195387000134308094',
            status_code: 'cs_dispoma',
            parent_status: 'confirmed',
            parent_status_formatted: 'Confirmed',
            description:
              'Customer submitted order on dispomart with request invoice mode',
            display_name: 'DISPOMART INV REQ ',
            label_name: 'cs_dispoma',
            color_code: '00c69c',
          },
        ],
        invoice_sub_statuses: [],
        shipment_sub_statuses: [],
        price_precision: 2,
        is_emailed: false,
        has_unconfirmed_line_item: false,
        picklists: [],
        purchaseorders: [],
        locations: [
          {
            location_id: '3195387000000247111',
            location_name: 'Organization Address',
            status: 'active',
          },
          {
            location_id: '3195387000000083044',
            location_name: 'Honeybee Herb Tradeshow (Warehouse)',
            status: 'active',
          },
          {
            location_id: '3195387000000083052',
            location_name: 'Honeybee Herb Tampa (Live) (Warehouse)*',
            status: 'active',
          },
          {
            location_id: '3195387000000083060',
            location_name: 'Honeybee Herb (Fulfillment World) (Warehouse)',
            status: 'active',
          },
          {
            location_id: '3195387000000083064',
            location_name: 'Honeybee Herb (Reserves) (Warehouse)',
            status: 'active',
          },
          {
            location_id: '3195387000002732190',
            location_name: 'China Warehouse (Warehouse)',
            status: 'active',
          },
          {
            location_id: '3195387000054750883',
            location_name: 'Item/SKU Correction Tampa (Warehouse)',
            status: 'active',
          },
          {
            location_id: '3195387000055463865',
            location_name: 'Tradeshow #2 (Warehouse)',
            status: 'active',
          },
          {
            location_id: '3195387000062551066',
            location_name: 'LA #2 Customs (Warehouse)',
            status: 'active',
          },
          {
            location_id: '3195387000102074725',
            location_name: 'Chicago Warehouse (Warehouse)',
            status: 'active',
          },
          {
            location_id: '3195387000155543138',
            location_name: 'GreenBox3PL (Warehouse)',
            status: 'active',
          },
          {
            location_id: '3195387000155571662',
            location_name: 'GreenBox3PL',
            status: 'active',
          },
          {
            location_id: '3195387000166702350',
            location_name: 'Honeybee Herb Tampa (Live)**TEST**',
            status: 'active',
          },
        ],
        billing_address_id: '3195387000094305655',
        billing_address: {
          address: '33 William Casey Road',
          street2: '',
          city: 'Spencer',
          state: 'Massachusetts',
          zip: '01562',
          country: 'U.S.A',
          country_code: 'US',
          county: '',
          state_code: 'MA',
          fax: '',
          phone: '774-272-2219',
          attention: 'Andrew Stoddard',
        },
        shipping_address_id: '3195387000094305655',
        shipping_address: {
          company_name: '',
          address: '33 William Casey Road',
          street2: '',
          city: 'Spencer',
          state: 'Massachusetts',
          zip: '01562',
          country: 'U.S.A',
          country_code: 'US',
          county: '',
          state_code: 'MA',
          fax: '',
          phone: '774-272-2219',
          attention: 'Andrew Stoddard',
        },
        is_test_order: false,
        notes: '',
        terms: '',
        payment_terms: 0,
        payment_terms_label: 'Due On Receipt ',
        custom_fields: [
          {
            field_id: '3195387000014025119',
            customfield_id: '3195387000014025119',
            show_in_store: false,
            show_in_portal: false,
            is_active: true,
            index: 1,
            label: 'Expected Ship Date Entered?',
            show_on_pdf: false,
            edit_on_portal: false,
            edit_on_store: false,
            api_name: 'cf_expected_ship_date_entered',
            show_in_all_pdf: false,
            value_formatted: 'false',
            search_entity: 'salesorder',
            data_type: 'check_box',
            placeholder: 'cf_expected_ship_date_entered',
            value: false,
            is_dependent_field: false,
          },
          {
            field_id: '3195387000000121143',
            customfield_id: '3195387000000121143',
            show_in_store: false,
            show_in_portal: false,
            is_active: true,
            index: 2,
            label: 'Bundle Builder ',
            show_on_pdf: false,
            edit_on_portal: false,
            edit_on_store: false,
            api_name: 'cf_custom_request',
            show_in_all_pdf: false,
            value_formatted: 'false',
            search_entity: 'salesorder',
            data_type: 'check_box',
            placeholder: 'cf_custom_request',
            value: false,
            is_dependent_field: false,
          },
          {
            field_id: '3195387000002361031',
            customfield_id: '3195387000002361031',
            show_in_store: false,
            show_in_portal: false,
            is_active: true,
            index: 3,
            label: 'Order Replacement',
            show_on_pdf: false,
            edit_on_portal: false,
            edit_on_store: false,
            is_color_code_supported: false,
            api_name: 'cf_order_replacement',
            show_in_all_pdf: false,
            selected_option_id: '3195387000002361033',
            value_formatted: 'No',
            search_entity: 'salesorder',
            data_type: 'dropdown',
            placeholder: 'cf_order_replacement',
            value: 'No',
            is_dependent_field: false,
          },
          {
            field_id: '3195387000010248496',
            customfield_id: '3195387000010248496',
            show_in_store: false,
            show_in_portal: false,
            is_active: true,
            index: 4,
            label: 'Invoice Paid',
            show_on_pdf: false,
            edit_on_portal: false,
            edit_on_store: false,
            api_name: 'cf_invoice_paid',
            show_in_all_pdf: false,
            value_formatted: 'false',
            search_entity: 'salesorder',
            data_type: 'check_box',
            placeholder: 'cf_invoice_paid',
            value: false,
            is_dependent_field: false,
          },
        ],
        custom_field_hash: {
          cf_expected_ship_date_entered: 'false',
          cf_expected_ship_date_entered_unformatted: false,
          cf_custom_request: 'false',
          cf_custom_request_unformatted: false,
          cf_order_replacement: 'No',
          cf_order_replacement_unformatted: 'No',
          cf_invoice_paid: 'false',
          cf_invoice_paid_unformatted: false,
        },
        template_id: '3195387000000842156',
        template_name: 'Spreadsheet',
        page_width: '8.27in',
        page_height: '11.69in',
        orientation: 'portrait',
        template_type: 'excel',
        template_type_formatted: 'Spreadsheet',
        created_time: '2025-09-26T13:48:56-0400',
        created_time_formatted: '09.26.25 01:48 PM',
        last_modified_time: '2025-09-26T13:48:56-0400',
        last_modified_time_formatted: '09.26.25 01:48 PM',
        created_by_id: '3195387000000075001',
        created_date: '2025-09-26',
        created_date_formatted: '09.26.25',
        last_modified_by_id: '3195387000000075001',
        attachment_name: '',
        can_send_in_mail: false,
        salesperson_id: '3195387000016554046',
        salesperson_name: 'Josh Pfautz',
        merchant_id: '',
        merchant_name: '',
        pickup_location_id: '',
        discount_amount_formatted: '$0.00',
        discount_amount: 0,
        discount: 0,
        discount_applied_on_amount_formatted: '$0.00',
        discount_applied_on_amount: 0,
        is_adv_tracking_in_package: false,
        shipping_charge_taxes: [],
        lock_details: { can_lock: false },
        locked_actions: [],
        shipping_charge_tax_id: '',
        shipping_charge_tax_name: '',
        shipping_charge_tax_type: '',
        shipping_charge_tax_percentage: '',
        shipping_charge_tax_exemption_id: '',
        shipping_charge_tax_exemption_code: '',
        shipping_charge_tax: '',
        bcy_shipping_charge_tax: '',
        shipping_charge_exclusive_of_tax: 24.68,
        shipping_charge_inclusive_of_tax: 24.68,
        shipping_charge_tax_formatted: '',
        shipping_charge_exclusive_of_tax_formatted: '$24.68',
        shipping_charge_inclusive_of_tax_formatted: '$24.68',
        shipping_charge: 24.68,
        shipping_charge_formatted: '$24.68',
        bcy_shipping_charge: 24.68,
        adjustment: 0,
        adjustment_formatted: '$0.00',
        bcy_adjustment: 0,
        adjustment_description: '',
        roundoff_value: 0,
        roundoff_value_formatted: '$0.00',
        transaction_rounding_type: 'no_rounding',
        rounding_mode: 'round_half_up',
        bcy_rounding_mode: 'round_half_up',
        sub_total: 647.75,
        sub_total_formatted: '$647.75',
        bcy_sub_total: 647.75,
        sub_total_inclusive_of_tax: 0,
        sub_total_inclusive_of_tax_formatted: '$0.00',
        sub_total_exclusive_of_discount: 647.75,
        sub_total_exclusive_of_discount_formatted: '$647.75',
        discount_total: 0,
        discount_total_formatted: '$0.00',
        bcy_discount_total: 0,
        discount_percent: 0,
        tax_total: 0,
        tax_total_formatted: '$0.00',
        bcy_tax_total: 0,
        total: 672.43,
        total_formatted: '$672.43',
        computation_type: 'basic',
        bcy_total: 672.43,
        taxes: [],
        tds_calculation_type: 'tds_item_level',
        packages: [],
        so_cycle_preference: {
          is_feature_enabled: false,
          socycle_status: 'not_triggered',
          socycle_status_formatted: 'Not Triggered',
          can_create_invoice: false,
          can_create_package: false,
          can_create_shipment: false,
          shipment_preference: {
            default_carrier: '',
            send_notification: false,
            deliver_shipments: false,
          },
          invoice_preference: {
            mark_as_sent: false,
            record_payment: false,
            payment_mode_id: '3195387000000013003',
            payment_account_id: '3195387000000000361',
          },
        },
        invoices: [],
        can_show_kit_return: false,
        is_kit_partial_return: false,
        salesreturns: [],
        payments: [],
        creditnotes: [],
        refunds: [],
        contact: {
          contact_number: 'CUS-401',
          customer_balance: 5331.91,
          customer_balance_formatted: '$5,331.91',
          credit_limit: 0,
          credit_limit_formatted: '$0.00',
          unused_customer_credits: 0,
          unused_customer_credits_formatted: '$0.00',
          is_credit_limit_migration_completed: true,
        },
        balance: 672.43,
        balance_formatted: '$672.43',
        approvers_list: [],
        is_scheduled_for_quick_shipment_create: false,
      },
    };
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
    const { bigCommerceOrder, salesPerson, group, channel } =
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

  @Step(8)
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
