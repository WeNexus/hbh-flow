import { ShopifyService } from '#lib/shopify/shopify.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { MongoService } from '#lib/core/services';
import { EnvService } from '#lib/core/env';
import { Logger } from '@nestjs/common';
import { keyBy } from 'lodash-es';

type ShopifyConnection = string;

type CollectionRule = {
  column: string;
  relation: string;
  condition: string;
};

type CollectionRuleSet = {
  appliedDisjunctively: boolean;
  rules: CollectionRule[];
};

export type SmartCollection = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml?: string | null;
  sortOrder?: string | null;
  templateSuffix?: string | null;
  seo?: {
    title?: string | null;
    description?: string | null;
  } | null;
  ruleSet: CollectionRuleSet; // presence implies "smart"
};

type PageInfo = { hasNextPage: boolean; endCursor?: string | null };

@Workflow({
  name: 'HBH - Sync Shopify Smart Collections',
  webhook: true,
  concurrency: 1,
  triggers: [
    cron('0 */2 * * *', {
      timezone: 'America/New_York', // Every 2 hours
    }),
  ],
})
export class SyncSmartCollectionsWorkflow extends WorkflowBase {
  constructor(
    private readonly shopify: ShopifyService,
    private readonly mongo: MongoService,
    private readonly env: EnvService,
  ) {
    super();
  }

  private logger = new Logger(SyncSmartCollectionsWorkflow.name);

  private sourceConnection: ShopifyConnection = 'hbh_wholesale';

  private destConnections: ShopifyConnection[] = [
    'ai1wholesale',
    // 'bakerbrands',
    'donkey-distro',
    'smokeand-vape-wholesale',
    // 'a13distro',
  ];

  private snapshotDbName = 'hbh';
  private snapshotCollectionName = 'hbh_shopify_smart_collections_snapshot';

  @Step(1)
  async fetchSnapshot(): Promise<string[]> {
    if (!this.env.isProd) {
      return this.cancel('Not running in production environment.');
    }

    const doc = await this.mongo
      .db(this.snapshotDbName)
      .collection(this.snapshotCollectionName)
      .findOne<{ collections: string[] }>();

    if (!doc?.collections?.length) return [];
    return doc.collections;
  }

  @Step(2)
  async fetchCollections(): Promise<SmartCollection[]> {
    return this.fetchAllSmartCollections(this.sourceConnection);
  }

  @Step(3)
  async upsertCollections() {
    const sourceCollections =
      await this.getResult<SmartCollection[]>('fetchCollections');
    if (!sourceCollections?.length) {
      this.logger.log('No smart collections found in source store.');
      return { perStore: [], totalSource: 0 };
    }

    const perStore: Array<{
      connection: ShopifyConnection;
      created: number;
      updated: number;
      skipped: number;
      errors: Array<{ handle: string; message: string }>;
    }> = [];

    for (const connection of this.destConnections) {
      const errors: Array<{ handle: string; message: string }> = [];

      // Pull existing smart collections once per destination and key by handle for fast matching
      const destCollections = await this.fetchAllSmartCollections(connection);
      const destByHandle = keyBy(destCollections, (c) => c.handle);

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const src of sourceCollections) {
        try {
          const existing = destByHandle[src.handle];

          if (!existing) {
            await this.collectionCreate(
              connection,
              this.toCollectionInput(src),
            );
            created++;
            continue;
          }

          // Update by ID in the destination store (IDs differ across stores)
          await this.collectionUpdate(connection, {
            id: existing.id,
            ...this.toCollectionInput(src),
          });
          updated++;
        } catch (e: any) {
          errors.push({
            handle: src.handle,
            message: e?.message ?? String(e),
          });
          skipped++;
        }
      }

      this.logger.log(
        `[${connection}] Upsert complete: created=${created}, updated=${updated}, skipped=${skipped}`,
      );

      perStore.push({ connection, created, updated, skipped, errors });
    }

    return { perStore, totalSource: sourceCollections.length };
  }

  @Step(4)
  async deleteCollections() {
    const snapshotHandles = await this.getResult<string[]>('fetchSnapshot');
    const current = await this.getResult<SmartCollection[]>('fetchCollections');

    const currentHandles = new Set((current ?? []).map((c) => c.handle));
    const removedHandles = (snapshotHandles ?? []).filter(
      (h) => !currentHandles.has(h),
    );

    if (!removedHandles.length) {
      this.logger.log('No removed smart collections detected from snapshot.');
      return { removedHandles: [], perStore: [] };
    }

    const perStore: Array<{
      connection: ShopifyConnection;
      deleted: number;
      notFound: number;
      errors: Array<{ handle: string; message: string }>;
    }> = [];

    for (const connection of this.destConnections) {
      const errors: Array<{ handle: string; message: string }> = [];
      let deleted = 0;
      let notFound = 0;

      // Fetch destination collections once and key by handle
      const destCollections = await this.fetchAllSmartCollections(connection);
      const destByHandle = keyBy(destCollections, (c) => c.handle);

      for (const handle of removedHandles) {
        try {
          const existing = destByHandle[handle];
          if (!existing) {
            notFound++;
            continue;
          }

          await this.collectionDelete(connection, existing.id);
          deleted++;
        } catch (e: any) {
          errors.push({ handle, message: e?.message ?? String(e) });
        }
      }

      this.logger.log(
        `[${connection}] Delete complete: deleted=${deleted}, notFound=${notFound}`,
      );

      perStore.push({ connection, deleted, notFound, errors });
    }

    return { removedHandles, perStore };
  }

  @Step(5)
  async updateSnapshot(collections: SmartCollection[]) {
    const handles = (collections ?? []).map((c) => c.handle);

    await this.mongo
      .db(this.snapshotDbName)
      .collection(this.snapshotCollectionName)
      .updateOne(
        {},
        {
          $set: {
            collections: handles,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );

    this.logger.log(`Snapshot updated with ${handles.length} handles.`);
    return handles;
  }

  // ----------------------------
  // Helpers
  // ----------------------------

  private toCollectionInput(src: SmartCollection) {
    return {
      title: src.title,
      handle: src.handle,
      descriptionHtml: src.descriptionHtml ?? undefined,
      sortOrder: src.sortOrder ?? undefined,
      templateSuffix: src.templateSuffix ?? undefined,
      seo: src.seo ?? undefined,
      ruleSet: src.ruleSet,
    };
  }

  private async fetchAllSmartCollections(
    connection: ShopifyConnection,
  ): Promise<SmartCollection[]> {
    const out: SmartCollection[] = [];
    let after: string | null = null;

    for (;;) {
      const res = await this.shopify.gql<{
        collections: {
          edges: Array<{
            cursor: string;
            node: {
              id: string;
              title: string;
              handle: string;
              descriptionHtml?: string | null;
              sortOrder?: string | null;
              templateSuffix?: string | null;
              seo?: {
                title?: string | null;
                description?: string | null;
              } | null;
              ruleSet?: {
                appliedDisjunctively: boolean;
                rules: Array<{
                  column: string;
                  relation: string;
                  condition: string;
                }>;
              } | null;
            };
          }>;
          pageInfo: PageInfo;
        };
      }>({
        connection,
        root: 'collections',
        variables: {
          first: 250,
          after,
          query: 'collection_type:smart',
        },
        query: `#graphql
          query ($first: Int!, $after: String, $query: String!) {
            collections(first: $first, after: $after, query: $query) {
              edges {
                cursor
                node {
                  id
                  title
                  handle
                  descriptionHtml
                  sortOrder
                  templateSuffix
                  seo { title description }
                  ruleSet {
                    appliedDisjunctively
                    rules {
                      column
                      relation
                      condition
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        `,
      });

      const edges = res?.edges ?? [];
      for (const e of edges) {
        // Defensive: only keep those that actually have ruleSet (smart collections)
        if (!e.node?.ruleSet) continue;

        out.push({
          id: e.node.id,
          title: e.node.title,
          handle: e.node.handle,
          descriptionHtml: e.node.descriptionHtml ?? undefined,
          sortOrder: e.node.sortOrder ?? undefined,
          templateSuffix: e.node.templateSuffix ?? undefined,
          seo: e.node.seo ?? undefined,
          ruleSet: {
            appliedDisjunctively: e.node.ruleSet.appliedDisjunctively,
            rules: (e.node.ruleSet.rules ?? []).map((r) => ({
              column: r.column,
              relation: r.relation,
              condition: r.condition,
            })),
          },
        });
      }

      const pageInfo = res?.pageInfo;
      if (!pageInfo?.hasNextPage) break;

      after = pageInfo.endCursor ?? null;
      if (!after) break;
    }

    return out;
  }

  private async collectionCreate(
    connection: ShopifyConnection,
    input: any,
  ): Promise<string> {
    const res = await this.shopify.gql<{
      collectionCreate: {
        collection: { id: string } | null;
        userErrors: Array<{ field?: string[]; message: string }>;
      };
    }>({
      connection,
      root: 'collectionCreate',
      variables: { input },
      query: `#graphql
        mutation ($input: CollectionInput!) {
          collectionCreate(input: $input) {
            collection { id }
            userErrors { field message }
          }
        }
      `,
    });

    if (res.userErrors?.length) {
      throw new Error(
        `collectionCreate userErrors: ${res.userErrors
          .map((e) => e.message)
          .join(', ')}`,
      );
    }

    if (!res.collectionCreate.collection?.id) {
      throw new Error('collectionCreate: missing collection id in response');
    }

    return res.collectionCreate.collection.id;
  }

  private async collectionUpdate(
    connection: ShopifyConnection,
    input: any,
  ): Promise<string> {
    const res = await this.shopify.gql<{
      collectionUpdate: {
        collection: { id: string } | null;
        userErrors: Array<{ field?: string[]; message: string }>;
      };
    }>({
      connection,
      root: 'collectionUpdate',
      variables: { input },
      query: `#graphql
        mutation ($input: CollectionInput!) {
          collectionUpdate(input: $input) {
            collection { id }
            userErrors { field message }
          }
        }
      `,
    });

    if (res.userErrors?.length) {
      throw new Error(
        `collectionUpdate userErrors: ${res.userErrors
          .map((e) => e.message)
          .join(', ')}`,
      );
    }

    if (!res.collectionUpdate.collection?.id) {
      throw new Error('collectionUpdate: missing collection id in response');
    }

    return res.collectionUpdate.collection.id;
  }

  private async collectionDelete(
    connection: ShopifyConnection,
    id: string,
  ): Promise<void> {
    const res = await this.shopify.gql<{
      collectionDelete: {
        deletedCollectionId: string | null;
        userErrors: Array<{ field?: string[]; message: string }>;
      };
    }>({
      connection,
      root: 'collectionDelete',
      variables: { input: { id } },
      query: `#graphql
        mutation ($input: CollectionDeleteInput!) {
          collectionDelete(input: $input) {
            deletedCollectionId
            userErrors { field message }
          }
        }
      `,
    });

    if (res.userErrors?.length) {
      throw new Error(
        `collectionDelete userErrors: ${res.userErrors
          .map((e) => e.message)
          .join(', ')}`,
      );
    }
  }
}
