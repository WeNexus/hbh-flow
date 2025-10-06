import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import mongodb from 'mongodb';

const MongoClient = mongodb.MongoClient;

@Workflow({
  webhook: true,
  name: 'HBH - Cache Inventory Customer in MongoDB',
})
export class CacheInventoryCustomerWorkflow extends WorkflowBase {
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

  @Step(1)
  async fetchData() {
    const customer = this.payload.contact;

    const group = customer.cf_bigcommerce_customer_group?.trim();

    // if (!group) {
    //   return $.flow.exit("No customer group");
    // }

    const isWholesale = /wholesale/gi.test(group);
    const isDistro = /distro/gi.test(group);

    // if (!isWholesale && !isDistro) {
    //   return $.flow.exit("Customer is neither wholesale nor distro");
    // }

    const bigCommerceCustomers = [];
    let page = 0;

    while (true) {
      const { data: res } = await this.bigCommerceService.get(`/v3/customers`, {
        connection: 'hbh',
        params: {
          'email:in': customer.contact_persons
            .filter((cp) => cp.is_primary_contact)
            .map((cp) => cp.email)
            .join(','),
          page: ++page,
          limit: 50,
        },
      });

      bigCommerceCustomers.push(
        ...res.data.map((c) => ({ ...this.setName(c), addresses: [] })),
      );

      if (res.data.length < 50) {
        break;
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    // const groups = await axios($, {
    //   url: `https://api.bigcommerce.com/stores/${this.bigCommerce.$auth.store_hash}/v2/customer_groups`,
    //   headers: {
    //     "X-Auth-Token": `${this.bigCommerce.$auth.access_token}`,
    //   },
    // });

    // if (bigCommerceCustomers.length > 0) {
    //   const idChunks = _.chunk(
    //     bigCommerceCustomers.map((c) => c.id),
    //     50,
    //   );

    //   for (const ids of idChunks) {
    //     let page = 0;

    //     while (true) {
    //       const { data: addresses } = await axios($, {
    //         url: `https://api.bigcommerce.com/stores/${this.bigCommerce.$auth.store_hash}/v3/customers/addresses`,
    //         headers: {
    //           "X-Auth-Token": `${this.bigCommerce.$auth.access_token}`,
    //         },
    //         params: {
    //           "customer_id:in": ids.join(","),
    //           page: ++page,
    //           limit: 50,
    //         },
    //       });

    //       for (const address of addresses) {
    //         const customer = bigCommerceCustomers.find(
    //           (c) => c.id === address.customer_id,
    //         );

    //         if (address) {
    //           customer.addresses.push(this.setName(address));
    //         }
    //       }

    //       if (addresses.length < 50) {
    //         break;
    //       }

    //       await new Promise((r) => setTimeout(r, 1000));
    //     }
    //   }
    // }

    const addresses = [];
    page = 0;

    while (true) {
      const { data: inventoryAddresses } = await this.zohoService.get(
        `/inventory/v1/contacts/${customer.contact_id}/address`,
        {
          connection: 'hbh',
          params: {
            organization_id: '776003162',
            page: ++page,
            per_page: 200,
          },
        },
      );

      addresses.push(...inventoryAddresses.addresses);

      if (inventoryAddresses.addresses.length < 200) {
        break;
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    const contactPersons = customer.contact_persons.map(this.setName);
    delete customer.contact_persons;

    return {
      customerType: isDistro ? 'distro' : 'wholesale',
      inventoryAddresses: addresses,
      inventoryCustomer: this.setName(customer),
      bigCommerceCustomers: bigCommerceCustomers.map(this.setName),
      contactPersons,
      // groups,
      usStates: {
        AL: 'Alabama',
        AK: 'Alaska',
        AS: 'American Samoa',
        AZ: 'Arizona',
        AR: 'Arkansas',
        CA: 'California',
        CO: 'Colorado',
        CT: 'Connecticut',
        DE: 'Delaware',
        DC: 'District Of Columbia',
        FM: 'Federated States Of Micronesia',
        FL: 'Florida',
        GA: 'Georgia',
        GU: 'Guam',
        HI: 'Hawaii',
        ID: 'Idaho',
        IL: 'Illinois',
        IN: 'Indiana',
        IA: 'Iowa',
        KS: 'Kansas',
        KY: 'Kentucky',
        LA: 'Louisiana',
        ME: 'Maine',
        MH: 'Marshall Islands',
        MD: 'Maryland',
        MA: 'Massachusetts',
        MI: 'Michigan',
        MN: 'Minnesota',
        MS: 'Mississippi',
        MO: 'Missouri',
        MT: 'Montana',
        NE: 'Nebraska',
        NV: 'Nevada',
        NH: 'New Hampshire',
        NJ: 'New Jersey',
        NM: 'New Mexico',
        NY: 'New York',
        NC: 'North Carolina',
        ND: 'North Dakota',
        MP: 'Northern Mariana Islands',
        OH: 'Ohio',
        OK: 'Oklahoma',
        OR: 'Oregon',
        PW: 'Palau',
        PA: 'Pennsylvania',
        PR: 'Puerto Rico',
        RI: 'Rhode Island',
        SC: 'South Carolina',
        SD: 'South Dakota',
        TN: 'Tennessee',
        TX: 'Texas',
        UT: 'Utah',
        VT: 'Vermont',
        VI: 'Virgin Islands',
        VA: 'Virginia',
        WA: 'Washington',
        WV: 'West Virginia',
        WI: 'Wisconsin',
        WY: 'Wyoming',
      },
    };
  }

  @Step(2)
  async upsertCustomer() {
    let {
      inventoryAddresses,
      contactPersons: contactPersonsToUpsert,
      bigCommerceCustomers,
      inventoryCustomer,
      usStates,
    } = await this.getResult('fetchData');

    const addressesToUpsert = inventoryAddresses.filter(
      (a) =>
        a.attention &&
        a.address &&
        a.city &&
        a.country_code &&
        (a.state || a.state_code) &&
        a.zip,
    );

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db('hbh');

    const customer = await db.collection('customer').updateOne(
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
          isActive: inventoryCustomer.status === 'active',
        },
      },
      { upsert: true },
    );

    const contactPersons =
      contactPersonsToUpsert.length > 0
        ? await db.collection('contact_person').bulkWrite(
            contactPersonsToUpsert.map((c) => ({
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
                    hasAccount: bigCommerceCustomers.some(
                      (bc) => c.email === bc.email,
                    ),
                    isActive: inventoryCustomer.status === 'active',
                  },
                },
                upsert: true,
              },
            })),
          )
        : null;

    const addresses =
      addressesToUpsert.length > 0
        ? await db.collection('address').bulkWrite(
            addressesToUpsert.map((a) => {
              const state =
                a.country_code === 'US'
                  ? (usStates[a.state_code || a.state] ?? a.state)
                  : a.state;
              const nameSplit = (a.attention || a.display_name)?.split(' ');

              return {
                updateOne: {
                  filter: { id: a.address_id },
                  update: {
                    $set: {
                      id: a.address_id,
                      customerId: inventoryCustomer.contact_id,
                      firstName: nameSplit?.[0]?.trim(),
                      lastName:
                        nameSplit
                          ?.slice(1)
                          ?.map((s) => s.trim())
                          .join(' ') || inventoryCustomer.company_name,
                      address: a.address,
                      street2: a.street2,
                      city: a.city,
                      country: a.country,
                      countryCode: a.country_code,
                      phone: a.phone,
                      zip: a.zip,
                      state,
                    },
                  },
                  upsert: true,
                },
              };
            }),
          )
        : null;

    const deletedContactPersons = await db
      .collection('contact_person')
      .deleteMany({
        customerId: inventoryCustomer.contact_id,
        email: { $nin: contactPersonsToUpsert.map((c) => c.email) },
      });

    const deletedAddresses = await db.collection('address').deleteMany({
      customerId: inventoryCustomer.contact_id,
      id: { $nin: inventoryAddresses.map((i) => i.address_id) },
    });

    await client.close();

    return {
      customer,
      addresses,
      contactPersons,
      deletedAddresses,
      deletedContactPersons,
    };
  }
}
