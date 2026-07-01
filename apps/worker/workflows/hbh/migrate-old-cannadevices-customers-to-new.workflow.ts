import { Shopify2Service } from '#lib/shopify/shopify2.service';
import { ShopifyService } from '#lib/shopify/shopify.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WorkflowBase } from '#lib/workflow/misc';
import { ZohoService } from '#lib/zoho/zoho.service';
import { MongoService } from '#lib/core/services';
import { Logger } from '@nestjs/common';
import * as readline from 'node:readline';
import axios from 'axios';
import {
  BulkOp,
  CANNA_NEW_CONNECTION,
  CANNA_OLD_CONNECTION,
  LOCATION_EXTERNAL_ID_PREFIX,
  MF_KEY_CRM_ACCOUNT_ID,
  MF_KEY_CRM_CONTACT_ID,
  MF_KEY_MARKET_ID,
  MF_NAMESPACE,
  MarketRef,
  fetchMarketsByTierKey,
  gidNumericId,
  marketUpdateCompanyLocations,
  pollBulkOperation,
  resolveTierName,
  setMetafields,
  startBulkQuery,
  streamBulkJsonl,
  tierKey,
  toCompanyAddressInput,
} from './cannadevices-b2b.util';

const ZOHO_CONNECTION = 'hbh';
const DB = 'hbh';
const COLL_OLD_CUSTOMERS = 'cannadevices_migration_old_customers';
const COLL_CRM_CONTACTS = 'cannadevices_migration_crm_contacts';
const COLL_TASKS = 'cannadevices_migration_tasks';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const escapeQuery = (v: string) => v.replace(/["\\]/g, '\\$&');

/** Detect Shopify throttling / transient network errors worth retrying. */
function isTransientError(e: any): boolean {
  const status: unknown = e?.response?.status ?? e?.status;
  if (
    typeof status === 'number' &&
    [429, 430, 500, 502, 503, 504].includes(status)
  )
    return true;
  const rawMsg: unknown = e?.message;
  const msg = typeof rawMsg === 'string' ? rawMsg.toLowerCase() : '';
  return (
    msg.includes('throttl') ||
    msg.includes('exceeded') ||
    msg.includes('rate limit') ||
    msg.includes('timeout') ||
    msg.includes('etimedout') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up')
  );
}

/** Run `worker` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        await worker(items[index], index);
      }
    },
  );
  await Promise.all(runners);
}

interface MigratePayload {
  /** Wipe the staging collections / task statuses and start fresh. */
  reset?: boolean;
  /** Cap the number of matched customers turned into tasks (for testing). */
  limit?: number;
  /** Tasks processed per rerun of the processing step. */
  batchSize?: number;
  /** Max tasks processed concurrently within a batch. */
  concurrency?: number;
  /** Build the match list only; do not write to Shopify/CRM. */
  dryRun?: boolean;
}

interface BulkOperation {
  id: string;
  status: string;
  url?: string | null;
  errorCode?: string | null;
  objectCount?: string | null;
}

interface OldAddress {
  id: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
  countryCodeV2?: string | null;
  phone?: string | null;
}

interface OldCustomerDoc {
  _id: string;
  gid: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  note?: string | null;
  tags?: string[];
  defaultAddressId?: string | null;
  addresses: OldAddress[];
}

interface CrmAccount {
  id: string;
  name?: string | null;
  priceList?: string | null;
  customerGroup?: string | null;
  shopifyId?: string | null;
  marketId?: string | null;
}

interface CrmContactDoc {
  _id: string; // lowercased email
  contactId: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  shopifyId?: string | null;
  account: CrmAccount;
}

interface TaskDoc {
  _id: string; // crm contact id
  status: 'pending' | 'done' | 'failed' | 'dry-run';
  email: string;
  contact: CrmContactDoc;
  oldCustomer: OldCustomerDoc;
}

/**
 * One-off migration of CannaDevices customers from the OLD Shopify store
 * (ShopifyService / connection `cannadevices`) to the NEW B2B store
 * (Shopify2Service / connection `canna-devices`).
 *
 * Pipeline:
 *   1. exportOldCustomers      — kick off a Shopify bulk export of old-store
 *                                customers (+ addresses)
 *   2. checkOldCustomersExport — poll the bulk operation until complete
 *   3. loadOldCustomers        — stream the JSONL result -> Mongo
 *   4. pullCrmContacts         — Zoho CRM contacts (+ their account tier) -> Mongo
 *   5. buildTasks              — match old customers to CRM contacts by email
 *   6. resolveMarkets          — resolve tier name -> Shopify Market id/numericId
 *   7. processTasks            — reconcile company + locations + customer +
 *                                metafields, write Shopify ids back to CRM
 *                                (batched, resumable)
 *   8-10. startMarketExport / pollMarketExport / applyMarketConditions —
 *         bulk-export every company location's market_id, group by market, and
 *         replace each market's company-location condition
 *
 * Runnable manually (no automatic trigger). Idempotent / re-runnable.
 */
@Workflow({
  name: 'HBH - Migrate Old CannaDevices Customers to New',
  concurrency: 1,
})
export class MigrateOldCannaDevicesCustomersToNewWorkflow extends WorkflowBase<MigratePayload> {
  constructor(
    private readonly shopify2Service: Shopify2Service,
    private readonly shopifyService: ShopifyService,
    private readonly zohoService: ZohoService,
    private readonly mongo: MongoService,
  ) {
    super();
  }

  private logger = new Logger(
    MigrateOldCannaDevicesCustomersToNewWorkflow.name,
  );

  private get oldCustomers() {
    return this.mongo.db(DB).collection<OldCustomerDoc>(COLL_OLD_CUSTOMERS);
  }
  private get crmContacts() {
    return this.mongo.db(DB).collection<CrmContactDoc>(COLL_CRM_CONTACTS);
  }
  private get tasks() {
    return this.mongo.db(DB).collection<TaskDoc>(COLL_TASKS);
  }

  // ---------------------------------------------------------------------------
  // Step 1 — kick off a bulk export of old-store customers (+ addresses)
  // ---------------------------------------------------------------------------
  @Step(1)
  async exportOldCustomers(): Promise<BulkOperation> {
    if (this.payload?.reset) {
      await this.oldCustomers.deleteMany({});
    }

    // `addressesV2` is a connection, so in the bulk result each address is
    // emitted as its own JSONL line tagged with its parent customer's gid.
    const exportQuery = `#graphql
      {
        customers {
          edges {
            node {
              id
              email
              firstName
              lastName
              phone
              note
              tags
              defaultAddress { id }
              addressesV2 {
                edges {
                  node {
                    id
                    firstName
                    lastName
                    company
                    address1
                    address2
                    city
                    provinceCode
                    zip
                    countryCodeV2
                    phone
                  }
                }
              }
            }
          }
        }
      }
    `;

    const res = await this.shopifyService.gql<{
      bulkOperation: BulkOperation | null;
      userErrors: { code?: string; field: string[]; message: string }[];
    }>({
      connection: CANNA_OLD_CONNECTION,
      root: 'bulkOperationRunQuery',
      variables: { query: exportQuery },
      query: `#graphql
        mutation ($query: String!) {
          bulkOperationRunQuery(query: $query) {
            bulkOperation { id status url errorCode }
            userErrors { code field message }
          }
        }
      `,
    });

    if (res.userErrors?.length) {
      throw new Error(
        `bulkOperationRunQuery: ${res.userErrors.map((e) => e.message).join(', ')}`,
      );
    }
    if (!res.bulkOperation?.id) {
      throw new Error('bulkOperationRunQuery: missing bulk operation');
    }

    this.delay(5000);
    return res.bulkOperation;
  }

  // ---------------------------------------------------------------------------
  // Step 2 — poll the bulk export until it completes
  // ---------------------------------------------------------------------------
  @Step(2)
  async checkOldCustomersExport(): Promise<BulkOperation> {
    const operation = await this.getResult<BulkOperation>('exportOldCustomers');
    if (!operation?.id) throw new Error('Bulk operation not found');

    const node = await this.shopifyService.gql<BulkOperation | null>({
      connection: CANNA_OLD_CONNECTION,
      root: 'node',
      variables: { operationId: operation.id },
      query: `#graphql
        query ($operationId: ID!) {
          node(id: $operationId) {
            ... on BulkOperation { id status url errorCode objectCount }
          }
        }
      `,
    });

    if (!node) throw new Error('Bulk operation not found');

    if (['CREATED', 'RUNNING', 'CANCELING'].includes(node.status)) {
      this.rerun(5000);
      return node;
    }
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(node.status)) {
      throw new Error(
        `Bulk export ${node.status} (errorCode: ${node.errorCode})`,
      );
    }

    this.logger.log(
      `Bulk export completed: ${node.objectCount ?? '?'} objects.`,
    );
    return node;
  }

  // ---------------------------------------------------------------------------
  // Step 3 — stream the JSONL result, reassemble addresses, upsert into Mongo
  // ---------------------------------------------------------------------------
  @Step(3)
  async loadOldCustomers() {
    const operation = await this.getResult<BulkOperation>(
      'checkOldCustomersExport',
    );

    // Empty result set -> no URL; nothing to load.
    if (!operation?.url) {
      this.logger.log('Bulk export produced no data.');
      return { count: 0 };
    }

    const res = await axios.get<NodeJS.ReadableStream>(operation.url, {
      responseType: 'stream',
    });
    const rl = readline.createInterface({
      input: res.data,
      crlfDelay: Infinity,
    });

    let count = 0;
    let batch: OldCustomerDoc[] = [];
    let current: OldCustomerDoc | null = null;

    const flush = async () => {
      if (!batch.length) return;
      await this.oldCustomers.bulkWrite(
        batch.map((doc) => ({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: doc },
            upsert: true,
          },
        })),
      );
      count += batch.length;
      batch = [];
    };

    // Shopify emits every child (address) after its parent customer, so we can
    // flush the previous customer once the next customer line appears.
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const obj = JSON.parse(trimmed);
      const id: string = obj.id ?? '';

      if (id.startsWith('gid://shopify/Customer/')) {
        if (current) batch.push(current);
        if (batch.length >= 500) await flush();
        current = {
          _id: gidNumericId(id)!,
          gid: id,
          email: obj.email ? obj.email.toLowerCase().trim() : null,
          firstName: obj.firstName,
          lastName: obj.lastName,
          phone: obj.phone,
          note: obj.note,
          tags: obj.tags ?? [],
          defaultAddressId: obj.defaultAddress
            ? gidNumericId(obj.defaultAddress.id)
            : null,
          addresses: [],
        };
      } else if (
        current !== null &&
        id.startsWith('gid://shopify/MailingAddress/') &&
        obj.__parentId === current.gid
      ) {
        current.addresses.push({
          id: gidNumericId(id),
          firstName: obj.firstName,
          lastName: obj.lastName,
          company: obj.company,
          address1: obj.address1,
          address2: obj.address2,
          city: obj.city,
          provinceCode: obj.provinceCode,
          zip: obj.zip,
          countryCodeV2: obj.countryCodeV2,
          phone: obj.phone,
        });
      }
    }

    if (current) batch.push(current);
    await flush();

    this.logger.log(`Loaded ${count} old-store customers.`);
    return { count };
  }

  // ---------------------------------------------------------------------------
  // Step 4 — pull CRM contacts (+ their account tier) into Mongo via COQL
  // ---------------------------------------------------------------------------
  @Step(4)
  async pullCrmContacts() {
    if (this.payload?.reset) {
      await this.crmContacts.deleteMany({});
    }

    let lastId = '0';
    let count = 0;

    for (;;) {
      const selectQuery = `select id, First_Name, Last_Name, Email, Phone, CannaDevices_Shopify_ID, Account_Name.id, Account_Name.Account_Name, Account_Name.Price_List, Account_Name.Customer_Group, Account_Name.CannaDevices_Shopify_ID, Account_Name.Shopify_Market_ID from Contacts where Email is not null and Account_Name is not null and id > ${lastId} order by id asc limit 200`;

      const { data } = await this.zohoService.post(
        `/crm/v8/coql`,
        { select_query: selectQuery },
        { connection: ZOHO_CONNECTION },
      );

      const rows: any[] = data?.data ?? [];
      if (!rows.length) break;

      const ops = rows
        .map((row) => this.normalizeCrmContact(row))
        .filter((c): c is CrmContactDoc => !!c)
        .map((c) => ({
          updateOne: {
            filter: { _id: c._id },
            update: { $set: c },
            upsert: true,
          },
        }));

      if (ops.length) await this.crmContacts.bulkWrite(ops);

      count += rows.length;
      lastId = rows[rows.length - 1].id;
      if (rows.length < 200) break;
      await sleep(300);
    }

    this.logger.log(`Pulled ${count} CRM contacts.`);
    return { count };
  }

  /** COQL returns lookup subfields either nested under the lookup or dot-keyed. */
  private normalizeCrmContact(row: any): CrmContactDoc | null {
    const email = row.Email ? row.Email.toString().toLowerCase().trim() : null;
    if (!email) return null;

    const acc = row.Account_Name ?? {};
    const read = (key: string): string | null => {
      const v: unknown = acc[key] ?? row[`Account_Name.${key}`];
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'bigint') return String(v);
      return null;
    };
    const accountId = read('id');
    if (!accountId) return null;

    return {
      _id: email,
      contactId: row.id != null ? String(row.id) : '',
      firstName: row.First_Name ?? null,
      lastName: row.Last_Name ?? null,
      email,
      phone: row.Phone ?? null,
      shopifyId:
        row.CannaDevices_Shopify_ID != null
          ? String(row.CannaDevices_Shopify_ID)
          : null,
      account: {
        id: accountId,
        name: read('Account_Name'),
        priceList: read('Price_List'),
        customerGroup: read('Customer_Group'),
        shopifyId: read('CannaDevices_Shopify_ID'),
        marketId: read('Shopify_Market_ID'),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Step 5 — match old customers to CRM contacts by email -> tasks
  // ---------------------------------------------------------------------------
  @Step(5)
  async buildTasks() {
    if (this.payload?.reset) {
      await this.tasks.deleteMany({});
    }

    const crm = await this.crmContacts.find({}).toArray();
    const byEmail = new Map<string, CrmContactDoc>();
    for (const c of crm) byEmail.set(c._id, c);

    const limit = this.payload?.limit;
    let matched = 0;
    let skipped = 0;
    let ops: any[] = [];

    const cursor = this.oldCustomers.find({});
    for await (const oc of cursor) {
      if (limit && matched >= limit) break;

      const contact = oc.email ? byEmail.get(oc.email) : undefined;
      if (!contact) {
        skipped++;
        continue;
      }

      ops.push({
        updateOne: {
          filter: { _id: contact.contactId },
          update: {
            // status only set on insert so re-running does not un-complete tasks
            $set: { email: oc.email, contact, oldCustomer: oc },
            $setOnInsert: { status: 'pending' },
          },
          upsert: true,
        },
      });
      matched++;

      if (ops.length >= 500) {
        await this.tasks.bulkWrite(ops);
        ops = [];
      }
    }
    if (ops.length) await this.tasks.bulkWrite(ops);

    this.logger.log(
      `Built tasks: ${matched} matched, ${skipped} skipped (no CRM contact).`,
    );
    return { matched, skipped };
  }

  // ---------------------------------------------------------------------------
  // Step 6 — resolve markets keyed by canonical tier key (Teir/Tier tolerant)
  // ---------------------------------------------------------------------------
  @Step(6)
  async resolveMarkets(): Promise<Record<string, MarketRef>> {
    return fetchMarketsByTierKey(this.shopify2Service);
  }

  // ---------------------------------------------------------------------------
  // Step 7 — process tasks in batches (reruns until none pending)
  // ---------------------------------------------------------------------------
  @Step(7)
  async processTasks() {
    const dryRun = !!this.payload?.dryRun;
    const size = this.payload?.batchSize ?? 30;
    const concurrency = this.payload?.concurrency ?? 5;
    const markets =
      (await this.getResult<Record<string, MarketRef>>('resolveMarkets')) ?? {};

    const pending = await this.tasks
      .find({ status: 'pending' })
      .limit(size)
      .toArray();

    if (!pending.length) {
      this.logger.log('No pending tasks remaining.');
      return { done: true };
    }

    let ok = 0;
    let failed = 0;

    // Process the batch with bounded concurrency. Each task is idempotent, so
    // withRetry can safely re-run the whole task on Shopify throttling.
    await mapWithConcurrency(pending, concurrency, async (task) => {
      try {
        if (dryRun) {
          await this.tasks.updateOne(
            { _id: task._id },
            { $set: { status: 'dry-run' } },
          );
          ok++;
          return;
        }

        const result = await this.withRetry(
          () => this.migrateOne(task, markets),
          `task ${task._id} (${task.email})`,
        );
        await this.tasks.updateOne(
          { _id: task._id },
          { $set: { status: 'done', result } as any },
        );
        ok++;
      } catch (e: any) {
        failed++;
        await this.tasks.updateOne(
          { _id: task._id },
          { $set: { status: 'failed', error: e?.message ?? String(e) } as any },
        );
        this.logger.error(
          `Task ${task._id} (${task.email}) failed: ${e?.message ?? e}`,
          e?.stack,
        );
      }
    });

    this.logger.log(
      `Batch processed: ok=${ok}, failed=${failed} (concurrency ${concurrency})`,
    );
    // Re-run this step to pick up the next batch of pending tasks.
    this.rerun(1000);
    return { batch: pending.length, ok, failed };
  }

  /**
   * Run `fn`, retrying on Shopify throttling / transient errors with
   * exponential backoff + jitter. Relies on `fn` being idempotent.
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = 6,
  ): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (e: any) {
        attempt++;
        if (attempt > maxRetries || !isTransientError(e)) throw e;
        const backoff =
          Math.min(30_000, 500 * 2 ** attempt) +
          Math.floor(Math.random() * 400);
        this.logger.warn(
          `${label}: transient error (attempt ${attempt}/${maxRetries}), retrying in ${backoff}ms: ${e?.message ?? e}`,
        );
        await sleep(backoff);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Step 8 — start a bulk export of every company location's market_id metafield
  // ---------------------------------------------------------------------------
  @Step(8)
  async startMarketExport(): Promise<BulkOp | null> {
    if (this.payload?.dryRun) return null;

    // One bulk query for the whole store; each location carries its market_id
    // metafield value so we can group by market and replace each market's set.
    const op = await startBulkQuery(
      this.shopify2Service,
      `{
        companyLocations {
          edges {
            node {
              id
              metafield(namespace: "${MF_NAMESPACE}", key: "${MF_KEY_MARKET_ID}") {
                value
              }
            }
          }
        }
      }`,
    );
    this.delay(5000);
    return op;
  }

  // ---------------------------------------------------------------------------
  // Step 9 — poll the market export, re-running until it completes
  // ---------------------------------------------------------------------------
  @Step(9)
  async pollMarketExport(): Promise<BulkOp | null> {
    const op = await this.getResult<BulkOp | null>('startMarketExport');
    if (!op?.id) return null;

    const node = await pollBulkOperation(this.shopify2Service, op.id);
    if (!node) throw new Error('Bulk operation not found');

    if (['CREATED', 'RUNNING', 'CANCELING'].includes(node.status)) {
      this.rerun(5000);
      return node;
    }
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(node.status)) {
      throw new Error(
        `Market export ${node.status} (errorCode: ${node.errorCode})`,
      );
    }

    this.logger.log(
      `Market export completed: ${node.objectCount ?? '?'} objects.`,
    );
    return node;
  }

  // ---------------------------------------------------------------------------
  // Step 10 — group locations by market_id and replace each market's condition
  // ---------------------------------------------------------------------------
  @Step(10)
  async applyMarketConditions() {
    const node = await this.getResult<BulkOp | null>('pollMarketExport');
    if (!node?.url) {
      this.logger.log('No market export data.');
      return { markets: 0 };
    }

    // marketNumericId -> [company location gids]
    const byMarket = new Map<string, string[]>();
    await streamBulkJsonl(node.url, (obj) => {
      const id: unknown = obj.id;
      const marketId: unknown = obj.metafield?.value;
      if (
        typeof id === 'string' &&
        id.startsWith('gid://shopify/CompanyLocation/') &&
        typeof marketId === 'string' &&
        marketId
      ) {
        const list = byMarket.get(marketId) ?? [];
        list.push(id);
        byMarket.set(marketId, list);
      }
    });

    const results: Array<{
      marketId: string;
      count: number;
      skipped: boolean;
    }> = [];
    for (const [marketNumericId, ids] of byMarket) {
      const result = await marketUpdateCompanyLocations(
        this.shopify2Service,
        `gid://shopify/Market/${marketNumericId}`,
        ids,
      );
      this.logger.log(`Market ${marketNumericId}: ${result.count} locations`);
      results.push(result);
      await sleep(300);
    }

    return { markets: results.length, results };
  }

  // ===========================================================================
  // Core per-customer migration
  // ===========================================================================
  private async migrateOne(task: TaskDoc, markets: Record<string, MarketRef>) {
    const { contact, oldCustomer } = task;
    const account = contact.account;

    const tierName = resolveTierName({
      Price_List: account.priceList,
      Customer_Group: account.customerGroup,
    });
    const key = tierKey(account.priceList || account.customerGroup);
    const market = key ? (markets[key] ?? null) : null;
    if (tierName && !market) {
      this.logger.warn(
        `Task ${task._id}: tier "${tierName}" has no market; company will not be added to any market.`,
      );
    }

    // 1. Company + locations
    const { companyGid, companyNumericId, taggedLocationGids } =
      await this.ensureCompanyAndLocations(account, oldCustomer, market);

    // 2. Company metafields
    await setMetafields(this.shopify2Service, [
      {
        ownerId: companyGid,
        namespace: MF_NAMESPACE,
        key: MF_KEY_CRM_ACCOUNT_ID,
        type: 'single_line_text_field',
        value: String(account.id),
      },
    ]);

    // 3. Customer (+ crm_contact_id metafield)
    const { customerGid, customerNumericId } =
      await this.ensureCustomer(contact);

    // 4. Associate customer with company
    await this.ensureContactAssignment(companyGid, customerGid);

    // 5. Write Shopify ids back to CRM
    await this.writeBackCrm(
      account,
      contact,
      companyNumericId,
      customerNumericId,
      market,
    );

    return {
      companyId: companyNumericId,
      customerId: customerNumericId,
      locations: taggedLocationGids.length,
      tier: tierName ?? null,
      marketId: market?.numericId ?? null,
    };
  }

  private buildDesiredAddresses(oldCustomer: OldCustomerDoc) {
    const addrs = [...(oldCustomer.addresses ?? [])];
    // Default address first so it becomes the company's primary location.
    if (oldCustomer.defaultAddressId) {
      addrs.sort((a, b) =>
        a.id === oldCustomer.defaultAddressId
          ? -1
          : b.id === oldCustomer.defaultAddressId
            ? 1
            : 0,
      );
    }

    const seen = new Set<string>();
    const out: {
      externalId: string;
      name: string;
      input: Record<string, string>;
    }[] = [];
    for (const a of addrs) {
      if (!a.id) continue;
      const input = toCompanyAddressInput(a);
      if (!input) continue;
      const externalId = `${LOCATION_EXTERNAL_ID_PREFIX}${a.id}`;
      if (seen.has(externalId)) continue;
      seen.add(externalId);
      const name =
        a.company ||
        [a.address1, a.city].filter(Boolean).join(', ') ||
        oldCustomer.email ||
        'Location';
      out.push({ externalId, name, input });
    }
    return out;
  }

  private async ensureCompanyAndLocations(
    account: CrmAccount,
    oldCustomer: OldCustomerDoc,
    market: MarketRef | null,
  ): Promise<{
    companyGid: string;
    companyNumericId: string;
    taggedLocationGids: string[];
  }> {
    const desired = this.buildDesiredAddresses(oldCustomer);

    // --- Resolve or create the company ---
    let companyGid: string | null = null;
    let existingLocations: { id: string; externalId?: string | null }[] = [];

    // (a) by stored CannaDevices_Shopify_ID
    if (account.shopifyId) {
      const gid = account.shopifyId.startsWith('gid://')
        ? account.shopifyId
        : `gid://shopify/Company/${account.shopifyId}`;
      const company = await this.fetchCompany(gid);
      if (company) {
        companyGid = company.id;
        existingLocations = company.locations;
      }
    }

    // (b) by crm_account_id metafield / name
    if (!companyGid) {
      const found = await this.findCompany(account);
      if (found) {
        companyGid = found.id;
        existingLocations = found.locations;
      }
    }

    // (c) create
    if (!companyGid) {
      const created = await this.createCompany(account, desired[0]);
      companyGid = created.id;
      existingLocations = created.locations;
    }

    const companyNumericId = gidNumericId(companyGid)!;

    // --- Create any missing locations (dedup by externalId) ---
    const existingExternalIds = new Set(
      existingLocations.map((l) => l.externalId).filter(Boolean) as string[],
    );

    // Location gids that map to a real (migrated) address, to be tagged.
    const taggedLocationGids: string[] = [];
    for (const l of existingLocations) {
      if (
        l.externalId &&
        l.externalId.startsWith(LOCATION_EXTERNAL_ID_PREFIX)
      ) {
        taggedLocationGids.push(l.id);
      }
    }

    for (const d of desired) {
      if (existingExternalIds.has(d.externalId)) continue;
      const locId = await this.createCompanyLocation(companyGid, d);
      if (locId) {
        existingExternalIds.add(d.externalId);
        taggedLocationGids.push(locId);
      }
    }

    // --- Tag the migrated locations with market_id + crm_account_id ---
    if (taggedLocationGids.length) {
      const metafields = taggedLocationGids.flatMap((ownerId) => {
        const list = [
          {
            ownerId,
            namespace: MF_NAMESPACE,
            key: MF_KEY_CRM_ACCOUNT_ID,
            type: 'single_line_text_field',
            value: String(account.id),
          },
        ];
        if (market) {
          list.push({
            ownerId,
            namespace: MF_NAMESPACE,
            key: MF_KEY_MARKET_ID,
            type: 'single_line_text_field',
            value: market.numericId,
          });
        }
        return list;
      });
      await setMetafields(this.shopify2Service, metafields);
    }

    return { companyGid, companyNumericId, taggedLocationGids };
  }

  private async fetchCompany(gid: string) {
    try {
      const company = await this.shopify2Service.gql<{
        id: string;
        locations: { nodes: { id: string; externalId?: string | null }[] };
      }>({
        connection: CANNA_NEW_CONNECTION,
        root: 'company',
        variables: { id: gid },
        query: `#graphql
          query ($id: ID!) {
            company(id: $id) {
              id
              locations(first: 100) {
                nodes { id externalId }
              }
            }
          }
        `,
      });
      if (!company?.id) return null;
      return { id: company.id, locations: company.locations?.nodes ?? [] };
    } catch (e: any) {
      this.logger.warn(`fetchCompany(${gid}) failed: ${e?.message ?? e}`);
      return null;
    }
  }

  private async findCompany(account: CrmAccount) {
    const parts: string[] = [];
    if (account.name) parts.push(`name:'${escapeQuery(account.name)}'`);
    parts.push(
      `metafields.${MF_NAMESPACE}.${MF_KEY_CRM_ACCOUNT_ID}:'${escapeQuery(String(account.id))}'`,
    );

    const res = await this.shopify2Service.gql<{
      nodes: {
        id: string;
        locations: { nodes: { id: string; externalId?: string | null }[] };
      }[];
    }>({
      connection: CANNA_NEW_CONNECTION,
      root: 'companies',
      variables: { query: parts.join(' OR ') },
      query: `#graphql
        query ($query: String!) {
          companies(first: 1, query: $query) {
            nodes {
              id
              locations(first: 100) {
                nodes { id externalId }
              }
            }
          }
        }
      `,
    });

    const node = res?.nodes?.[0];
    if (!node) return null;
    return { id: node.id, locations: node.locations?.nodes ?? [] };
  }

  private async createCompany(
    account: CrmAccount,
    primary?: {
      externalId: string;
      name: string;
      input: Record<string, string>;
    },
  ) {
    const companyInput: Record<string, any> = {
      company: {
        name: account.name || `CRM Account ${account.id}`,
        externalId: String(account.id),
      },
    };
    // Populate the auto-created default location with the primary address
    // so we don't leave an empty default location behind.
    if (primary) {
      companyInput.companyLocation = {
        name: primary.name,
        externalId: primary.externalId,
        shippingAddress: primary.input,
        billingSameAsShipping: true,
      };
    }

    const res = await this.shopify2Service.gql<{
      company: {
        id: string;
        locations: { nodes: { id: string; externalId?: string | null }[] };
      } | null;
      userErrors: { field: string[]; message: string }[];
    }>({
      connection: CANNA_NEW_CONNECTION,
      root: 'companyCreate',
      variables: { input: companyInput },
      query: `#graphql
        mutation ($input: CompanyCreateInput!) {
          companyCreate(input: $input) {
            company {
              id
              locations(first: 100) {
                nodes { id externalId }
              }
            }
            userErrors { field message }
          }
        }
      `,
    });

    if (res?.company?.id) {
      return {
        id: res.company.id,
        locations: res.company.locations?.nodes ?? [],
      };
    }

    // Creation failed — likely name/externalId already taken; recover by search.
    this.logger.warn(
      `companyCreate for account ${account.id}: ${(res?.userErrors ?? []).map((e) => e.message).join(', ')}`,
    );
    const recovered = await this.findCompany(account);
    if (recovered) return recovered;

    throw new Error(
      `companyCreate failed for account ${account.id}: ${(res?.userErrors ?? []).map((e) => e.message).join(', ')}`,
    );
  }

  private async createCompanyLocation(
    companyGid: string,
    d: { externalId: string; name: string; input: Record<string, string> },
  ): Promise<string | null> {
    const res = await this.shopify2Service.gql<{
      companyLocation: { id: string } | null;
      userErrors: { field: string[]; message: string }[];
    }>({
      connection: CANNA_NEW_CONNECTION,
      root: 'companyLocationCreate',
      variables: {
        companyId: companyGid,
        input: {
          name: d.name,
          externalId: d.externalId,
          shippingAddress: d.input,
          billingSameAsShipping: true,
        },
      },
      query: `#graphql
        mutation ($companyId: ID!, $input: CompanyLocationInput!) {
          companyLocationCreate(companyId: $companyId, input: $input) {
            companyLocation { id }
            userErrors { field message }
          }
        }
      `,
    });

    if (res?.companyLocation?.id) return res.companyLocation.id;
    this.logger.warn(
      `companyLocationCreate (${d.externalId}): ${(res?.userErrors ?? []).map((e) => e.message).join(', ')}`,
    );
    return null;
  }

  private async ensureCustomer(contact: CrmContactDoc) {
    let customerGid: string | null = null;

    if (contact.shopifyId) {
      const gid = contact.shopifyId.startsWith('gid://')
        ? contact.shopifyId
        : `gid://shopify/Customer/${contact.shopifyId}`;
      const found = await this.fetchCustomer(gid);
      if (found) customerGid = found;
    }

    if (!customerGid) {
      const res = await this.shopify2Service.gql<{
        nodes: { id: string }[];
      }>({
        connection: CANNA_NEW_CONNECTION,
        root: 'customers',
        variables: {
          query: `email:${escapeQuery(contact.email)} OR metafields.${MF_NAMESPACE}.${MF_KEY_CRM_CONTACT_ID}:'${escapeQuery(contact.contactId)}'`,
        },
        query: `#graphql
          query ($query: String!) {
            customers(first: 1, query: $query) {
              nodes { id }
            }
          }
        `,
      });
      customerGid = res?.nodes?.[0]?.id ?? null;
    }

    if (!customerGid) {
      const res = await this.shopify2Service.gql<{
        customer: { id: string } | null;
        userErrors: { field: string[]; message: string }[];
      }>({
        connection: CANNA_NEW_CONNECTION,
        root: 'customerCreate',
        variables: {
          input: {
            firstName: contact.firstName ?? '',
            lastName: contact.lastName ?? '',
            email: contact.email,
            metafields: [
              {
                namespace: MF_NAMESPACE,
                key: MF_KEY_CRM_CONTACT_ID,
                type: 'single_line_text_field',
                value: String(contact.contactId),
              },
            ],
          },
        },
        query: `#graphql
          mutation ($input: CustomerInput!) {
            customerCreate(input: $input) {
              customer { id }
              userErrors { field message }
            }
          }
        `,
      });

      if (!res?.customer?.id) {
        throw new Error(
          `customerCreate failed for ${contact.email}: ${(res?.userErrors ?? []).map((e) => e.message).join(', ')}`,
        );
      }
      customerGid = res.customer.id;
    } else {
      // Ensure the crm_contact_id metafield exists on the found customer.
      await setMetafields(this.shopify2Service, [
        {
          ownerId: customerGid,
          namespace: MF_NAMESPACE,
          key: MF_KEY_CRM_CONTACT_ID,
          type: 'single_line_text_field',
          value: String(contact.contactId),
        },
      ]);
    }

    return { customerGid, customerNumericId: gidNumericId(customerGid)! };
  }

  private async fetchCustomer(gid: string): Promise<string | null> {
    try {
      const res = await this.shopify2Service.gql<{ id: string } | null>({
        connection: CANNA_NEW_CONNECTION,
        root: 'customer',
        variables: { id: gid },
        query: `#graphql
          query ($id: ID!) {
            customer(id: $id) { id }
          }
        `,
      });
      return res?.id ?? null;
    } catch (e: any) {
      this.logger.warn(`fetchCustomer(${gid}) failed: ${e?.message ?? e}`);
      return null;
    }
  }

  private async ensureContactAssignment(
    companyGid: string,
    customerGid: string,
  ) {
    // Skip if the customer is already a contact of this company.
    const profiles = await this.shopify2Service.gql<{
      companyContactProfiles: { company: { id: string } }[];
    } | null>({
      connection: CANNA_NEW_CONNECTION,
      root: 'customer',
      variables: { id: customerGid },
      query: `#graphql
        query ($id: ID!) {
          customer(id: $id) {
            companyContactProfiles {
              company { id }
            }
          }
        }
      `,
    });

    const already = (profiles?.companyContactProfiles ?? []).some(
      (p) => p.company.id === companyGid,
    );
    if (already) return;

    const res = await this.shopify2Service.gql<{
      companyContact: { id: string } | null;
      userErrors: { field: string[]; message: string }[];
    }>({
      connection: CANNA_NEW_CONNECTION,
      root: 'companyAssignCustomerAsContact',
      variables: { companyId: companyGid, customerId: customerGid },
      query: `#graphql
        mutation ($companyId: ID!, $customerId: ID!) {
          companyAssignCustomerAsContact(companyId: $companyId, customerId: $customerId) {
            companyContact { id }
            userErrors { field message }
          }
        }
      `,
    });

    if (res?.userErrors?.length) {
      this.logger.warn(
        `companyAssignCustomerAsContact: ${res.userErrors.map((e) => e.message).join(', ')}`,
      );
    }
  }

  private async writeBackCrm(
    account: CrmAccount,
    contact: CrmContactDoc,
    companyNumericId: string,
    customerNumericId: string,
    market: MarketRef | null,
  ) {
    await this.zohoService.put(
      `/crm/v8/Accounts/${account.id}`,
      {
        data: [
          {
            id: account.id,
            CannaDevices_Shopify_ID: companyNumericId,
            Shopify_Market_ID: market?.numericId ?? null,
          },
        ],
      },
      { connection: ZOHO_CONNECTION },
    );

    await this.zohoService.put(
      `/crm/v8/Contacts/${contact.contactId}`,
      {
        data: [
          {
            id: contact.contactId,
            CannaDevices_Shopify_ID: customerNumericId,
          },
        ],
      },
      { connection: ZOHO_CONNECTION },
    );
  }
}
