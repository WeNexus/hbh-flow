import { Shopify2Service } from '#lib/shopify/shopify2.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { MongoService } from '#lib/core/services';
import { EnvService } from '#lib/core/env';
import { Logger } from '@nestjs/common';
import { chunk } from 'lodash-es';

interface PricebookItem {
  itemId: string;
  rate: number;
}

interface PricebookData {
  zohoId: string;
  name: string;
  items: PricebookItem[];
}

interface CatalogMapping {
  marketId: string;
  catalogId: string;
  priceListId: string;
}

type CatalogSnapshot = Record<string, CatalogMapping>;

interface ResolvedVariants {
  itemIdToSku: Record<string, string>;
  skuToVariantId: Record<string, string>;
}

@Workflow({
  name: 'HBH - Sync Zoho Price Lists to Shopify B2B Catalogs',
  webhook: true,
  concurrency: 1,
  triggers: [
    cron('0 */8 * * *', {
      timezone: 'America/New_York',
    }),
  ],
})
export class SyncPriceListsToShopifyB2BCatalogsWorkflow extends WorkflowBase {
  constructor(
    private readonly shopify2: Shopify2Service,
    private readonly zohoService: ZohoService,
    private readonly mongo: MongoService,
    private readonly env: EnvService,
  ) {
    super();
  }

  private logger = new Logger(SyncPriceListsToShopifyB2BCatalogsWorkflow.name);

  private readonly shopifyConnection = 'canna-devices';
  private readonly zohoConnection = 'hbh';
  private readonly snapshotDbName = 'hbh';
  private readonly snapshotCollectionName = 'hbh_shopify_b2b_catalogs_snapshot';

  private readonly priceLists = [
    { zohoId: '3195387000084237271', name: 'Master Distro Tier 1' },
    { zohoId: '3195387000084244429', name: 'Master Distro Tier 2' },
    { zohoId: '3195387000084246587', name: 'Master Distro Tier 3' },
    { zohoId: '3195387000084248745', name: 'Wholesale Tier 1' },
    { zohoId: '3195387000084251903', name: 'Wholesale Tier 2' },
    { zohoId: '3195387000084255061', name: 'Wholesale Tier 3' },
    { zohoId: '3195387000084257219', name: 'Wholesale Tier 4' },
    { zohoId: '3195387000084259383', name: 'Wholesale Tier 5' },
    { zohoId: '3195387000096563127', name: 'Wholesale Tier 6' }
  ];

  @Step(1)
  async fetchSnapshot(): Promise<CatalogSnapshot> {
    if (!this.env.isProd) {
      this.cancel('Not running in production environment.');
      return {};
    }

    const doc = await this.mongo
      .db(this.snapshotDbName)
      .collection(this.snapshotCollectionName)
      .findOne<{ catalogs: CatalogSnapshot }>();

    return doc?.catalogs ?? {};
  }

  @Step(2)
  async fetchPricebooks(): Promise<PricebookData[]> {
    const result: PricebookData[] = [];

    for (const pl of this.priceLists) {
      const { data } = await this.zohoService.get(
        `/inventory/v1/pricebooks/${pl.zohoId}`,
        { connection: this.zohoConnection },
      );

      const items: PricebookItem[] = (
        data.pricebook?.pricebook_items ?? []
      ).map((item: any) => ({
        itemId: item.item_id.toString(),
        rate: parseFloat(item.pricebook_rate.toString()),
      }));

      result.push({ zohoId: pl.zohoId, name: pl.name, items });
      this.logger.log(`Fetched ${items.length} items for "${pl.name}"`);
      await new Promise((r) => setTimeout(r, 300));
    }

    return result;
  }

  @Step(3)
  async resolveVariants(): Promise<ResolvedVariants> {
    const pricebooks = await this.getResult<PricebookData[]>('fetchPricebooks');
    const allItemIds = [
      ...new Set(
        (pricebooks ?? []).flatMap((pb) => pb.items.map((i) => i.itemId)),
      ),
    ];

    if (!allItemIds.length) {
      return { itemIdToSku: {}, skuToVariantId: {} };
    }

    // Map Zoho item_id ? SKU via MongoDB item collection
    const dbItems = await this.mongo
      .db('hbh')
      .collection('item')
      .find({ id: { $in: allItemIds } }, { projection: { id: 1, sku: 1 } })
      .toArray();

    const itemIdToSku: Record<string, string> = {};
    for (const item of dbItems) {
      itemIdToSku[item.id.toString()] = item.sku;
    }

    const allSkus = [...new Set(Object.values(itemIdToSku))].filter(Boolean);
    this.logger.log(`Resolving ${allSkus.length} SKUs to Shopify variant IDs`);

    // Map SKU ? Shopify variant GID in batches of 50
    const skuToVariantId: Record<string, string> = {};

    for (const skuBatch of chunk(allSkus, 50)) {
      const query = skuBatch.map((s) => `sku:${s}`).join(' OR ');
      let after: string | null = null;

      for (;;) {
        const res = await this.shopify2.gql<{
          nodes: { id: string; sku: string }[];
          pageInfo: { hasNextPage: boolean; endCursor?: string | null };
        }>({
          connection: this.shopifyConnection,
          root: 'productVariants',
          variables: { first: 250, after, query },
          query: `#graphql
            query ($first: Int!, $after: String, $query: String!) {
              productVariants(first: $first, after: $after, query: $query) {
                nodes { id sku }
                pageInfo { hasNextPage endCursor }
              }
            }
          `,
        });

        for (const node of res?.nodes ?? []) {
          if (node.sku) skuToVariantId[node.sku] = node.id;
        }

        if (!res?.pageInfo?.hasNextPage) break;
        after = res.pageInfo.endCursor ?? null;
        if (!after) break;
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    this.logger.log(
      `Resolved ${Object.keys(skuToVariantId).length} Shopify variant IDs`,
    );

    return { itemIdToSku, skuToVariantId };
  }

  @Step(4)
  async syncCatalogs(): Promise<CatalogSnapshot> {
    const snapshot =
      (await this.getResult<CatalogSnapshot>('fetchSnapshot')) ?? {};
    const pricebooks =
      (await this.getResult<PricebookData[]>('fetchPricebooks')) ?? [];
    const { itemIdToSku, skuToVariantId } =
      (await this.getResult<ResolvedVariants>('resolveVariants')) ?? {
        itemIdToSku: {},
        skuToVariantId: {},
      };

    const updatedSnapshot: CatalogSnapshot = { ...snapshot };

    for (const pb of pricebooks) {
      this.logger.log(`Syncing catalog for "${pb.name}"...`);

      const mapping =
        snapshot[pb.zohoId] ?? (await this.findOrCreateMarket(pb.name));

      updatedSnapshot[pb.zohoId] = mapping;

      const prices: { variantId: string; amount: number }[] = [];
      for (const item of pb.items) {
        const sku = itemIdToSku[item.itemId];
        if (!sku) continue;
        const variantId = skuToVariantId[sku];
        if (!variantId) continue;
        prices.push({ variantId, amount: item.rate });
      }

      this.logger.log(
        `${prices.length} matched variants for "${pb.name}" ? syncing prices`,
      );

      if (prices.length) {
        await this.replaceFixedPrices(mapping.priceListId, prices);
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    return updatedSnapshot;
  }

  @Step(5)
  async updateSnapshot() {
    const catalogs = await this.getResult<CatalogSnapshot>('syncCatalogs');

    await this.mongo
      .db(this.snapshotDbName)
      .collection(this.snapshotCollectionName)
      .updateOne(
        {},
        { $set: { catalogs, updatedAt: new Date() } },
        { upsert: true },
      );

    this.logger.log('Snapshot updated.');
    return catalogs;
  }

  // -----------------------------------------------------------

  private async findOrCreateMarket(name: string): Promise<CatalogMapping> {
    // Paginate through all markets looking for an exact name match
    let after: string | null = null;

    for (;;) {
      const res = await this.shopify2.gql<{
        nodes: Array<{
          id: string;
          name: string;
          catalogs: {
            nodes: Array<{ id: string; priceList?: { id: string } | null }>;
          };
        }>;
        pageInfo: { hasNextPage: boolean; endCursor?: string | null };
      }>({
        connection: this.shopifyConnection,
        root: 'markets',
        variables: { first: 250, after },
        query: `#graphql
          query ($first: Int!, $after: String) {
            markets(first: $first, after: $after) {
              nodes {
                id
                name
                catalogs(first: 1) {
                  nodes {
                    id
                    priceList { id }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
      });

      for (const node of res?.nodes ?? []) {
        if (node.name === name) {
          const catalog = node.catalogs?.nodes?.[0];
          if (catalog?.id && catalog.priceList?.id) {
            this.logger.log(`Found existing market for "${name}": ${node.id}`);
            return {
              marketId: node.id,
              catalogId: catalog.id,
              priceListId: catalog.priceList.id,
            };
          }
          if (catalog?.id) {
            // Market + catalog exist but catalog has no price list yet
            return this.ensurePriceListOnCatalog(name, node.id, catalog.id, undefined);
          }
          // Market exists but has no catalog yet
          return this.createCatalogForMarket(name, node.id);
        }
      }

      if (!res?.pageInfo?.hasNextPage) break;
      after = res.pageInfo.endCursor ?? null;
      if (!after) break;
    }

    return this.createMarketWithCatalog(name);
  }

  private async createMarketWithCatalog(name: string): Promise<CatalogMapping> {
    const marketRes = await this.shopify2.gql<{
      market: { id: string } | null;
      userErrors: { field: string[]; message: string; code: string }[];
    }>({
      connection: this.shopifyConnection,
      root: 'marketCreate',
      variables: { input: { name, status: 'ACTIVE' } },
      query: `#graphql
        mutation ($input: MarketCreateInput!) {
          marketCreate(input: $input) {
            market { id }
            userErrors { field message code }
          }
        }
      `,
    });

    if (marketRes.userErrors?.length) {
      throw new Error(
        `marketCreate: ${marketRes.userErrors.map((e) => e.message).join(', ')}`,
      );
    }
    if (!marketRes.market?.id) {
      throw new Error('marketCreate: missing market ID');
    }

    this.logger.log(`Created market "${name}": ${marketRes.market.id}`);
    return this.createCatalogForMarket(name, marketRes.market.id);
  }

  private async createCatalogForMarket(
    name: string,
    marketId: string,
  ): Promise<CatalogMapping> {
    // Check globally before creating to avoid "Title has already been taken"
    const existing = await this.findCatalogByTitle(name);
    if (existing) {
      this.logger.log(`Found existing catalog "${name}": ${existing.id}`);
      return this.ensurePriceListOnCatalog(
        name,
        marketId,
        existing.id,
        existing.priceListId,
      );
    }

    const priceListId = await this.findOrCreatePriceList(name);

    const catRes = await this.shopify2.gql<{
      catalog: { id: string } | null;
      userErrors: { field: string[]; message: string; code: string }[];
    }>({
      connection: this.shopifyConnection,
      root: 'catalogCreate',
      variables: {
        input: {
          title: name,
          status: 'ACTIVE',
          priceListId,
          context: { marketIds: [marketId] },
        },
      },
      query: `#graphql
        mutation ($input: CatalogCreateInput!) {
          catalogCreate(input: $input) {
            catalog { id }
            userErrors { field message code }
          }
        }
      `,
    });

    if (catRes.userErrors?.length) {
      throw new Error(
        `catalogCreate: ${catRes.userErrors.map((e) => e.message).join(', ')}`,
      );
    }
    if (!catRes.catalog?.id) {
      throw new Error('catalogCreate: missing catalog ID');
    }

    this.logger.log(
      `Created catalog for market "${name}": ${catRes.catalog.id}`,
    );
    return { marketId, catalogId: catRes.catalog.id, priceListId };
  }

  private async ensurePriceListOnCatalog(
    name: string,
    marketId: string,
    catalogId: string,
    existingPriceListId: string | undefined,
  ): Promise<CatalogMapping> {
    const priceListId =
      existingPriceListId ?? (await this.findOrCreatePriceList(name));

    if (!existingPriceListId) {
      const updateRes = await this.shopify2.gql<{
        catalog: { id: string } | null;
        userErrors: { field: string[]; message: string; code: string }[];
      }>({
        connection: this.shopifyConnection,
        root: 'catalogUpdate',
        variables: { id: catalogId, input: { priceListId } },
        query: `#graphql
          mutation ($id: ID!, $input: CatalogUpdateInput!) {
            catalogUpdate(id: $id, input: $input) {
              catalog { id }
              userErrors { field message code }
            }
          }
        `,
      });

      if (updateRes.userErrors?.length) {
        this.logger.warn(
          `catalogUpdate: ${updateRes.userErrors.map((e) => e.message).join(', ')}`,
        );
      }
    }

    return { marketId, catalogId, priceListId };
  }

  private async findCatalogByTitle(
    title: string,
  ): Promise<{ id: string; priceListId?: string } | null> {
    let after: string | null = null;

    for (;;) {
      const res = await this.shopify2.gql<{
        nodes: Array<{
          id: string;
          title: string;
          priceList?: { id: string } | null;
        }>;
        pageInfo: { hasNextPage: boolean; endCursor?: string | null };
      }>({
        connection: this.shopifyConnection,
        root: 'catalogs',
        variables: { first: 250, after },
        query: `#graphql
          query ($first: Int!, $after: String) {
            catalogs(first: $first, after: $after) {
              nodes {
                id
                title
                priceList { id }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
      });

      for (const node of res?.nodes ?? []) {
        if (node.title === title) {
          return { id: node.id, priceListId: node.priceList?.id };
        }
      }

      if (!res?.pageInfo?.hasNextPage) break;
      after = res.pageInfo.endCursor ?? null;
      if (!after) break;
    }

    return null;
  }

  private async findOrCreatePriceList(name: string) {
    // Paginate through all price lists looking for an exact title match
    let after: string | null = null;

    for (;;) {
      const res = await this.shopify2.gql<{
        nodes: Array<{
          id: string;
          name: string;
          catalog?: { id: string } | null;
        }>;
        pageInfo: { hasNextPage: boolean; endCursor?: string | null };
      }>({
        connection: this.shopifyConnection,
        root: 'priceLists',
        variables: { first: 250, after },
        query: `#graphql
          query ($first: Int!, $after: String) {
            priceLists(first: $first, after: $after) {
              nodes {
                id
                name
                catalog {
                  id
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `,
      });

      for (const node of res?.nodes ?? []) {
        if (node.name === name && !node.catalog?.id) {
          this.logger.log(`Found existing priceList for "${name}": ${node.id}`);
          return node.id;
        }
      }

      if (!res?.pageInfo?.hasNextPage) break;
      after = res.pageInfo.endCursor ?? null;
      if (!after) break;
    }

    return this.createPriceList(name);
  }

  private async createPriceList(name: string) {
    const plRes = await this.shopify2.gql<{
      priceList: { id: string } | null;
      userErrors: { field: string[]; message: string }[];
    }>({
      connection: this.shopifyConnection,
      root: 'priceListCreate',
      variables: {
        input: {
          name,
          currency: 'USD',
          parent: {
            adjustment: { type: 'PERCENTAGE_DECREASE', value: 0 },
          },
        },
      },
      query: `#graphql
        mutation ($input: PriceListCreateInput!) {
          priceListCreate(input: $input) {
            priceList { id }
            userErrors { field message }
          }
        }
      `,
    });

    if (plRes.userErrors?.length) {
      throw new Error(
        `priceListCreate: ${plRes.userErrors.map((e) => e.message).join(', ')}`,
      );
    }
    if (!plRes.priceList?.id) {
      throw new Error('priceListCreate: missing price list ID');
    }

    return plRes.priceList.id;
  }

  private async replaceFixedPrices(
    priceListId: string,
    prices: { variantId: string; amount: number }[],
  ) {
    const existingVariantIds =
      await this.fetchAllFixedPriceVariantIds(priceListId);

    // Delete existing fixed prices in batches to avoid stale entries
    for (const batch of chunk(existingVariantIds, 250)) {
      const delRes = await this.shopify2.gql<{
        deletedFixedPriceVariantIds: string[];
        userErrors: { field: string[]; message: string }[];
      }>({
        connection: this.shopifyConnection,
        root: 'priceListFixedPricesDelete',
        variables: { priceListId, variantIds: batch },
        query: `#graphql
          mutation ($priceListId: ID!, $variantIds: [ID!]!) {
            priceListFixedPricesDelete(priceListId: $priceListId, variantIds: $variantIds) {
              deletedFixedPriceVariantIds
              userErrors { field message }
            }
          }
        `,
      });

      if (delRes.userErrors?.length) {
        this.logger.warn(
          `priceListFixedPricesDelete: ${delRes.userErrors.map((e) => e.message).join(', ')}`,
        );
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    // Add all current prices in batches
    for (const batch of chunk(prices, 250)) {
      const addRes = await this.shopify2.gql<{
        prices: { variant: { id: string }; price: { amount: string } }[];
        userErrors: { field: string[]; message: string }[];
      }>({
        connection: this.shopifyConnection,
        root: 'priceListFixedPricesAdd',
        variables: {
          priceListId,
          prices: batch.map((p) => ({
            variantId: p.variantId,
            price: { amount: p.amount.toFixed(2), currencyCode: 'USD' },
          })),
        },
        query: `#graphql
          mutation ($priceListId: ID!, $prices: [PriceListPriceInput!]!) {
            priceListFixedPricesAdd(priceListId: $priceListId, prices: $prices) {
              prices { variant { id } price { amount } }
              userErrors { field message }
            }
          }
        `,
      });

      if (addRes.userErrors?.length) {
        this.logger.warn(
          `priceListFixedPricesAdd: ${addRes.userErrors.map((e) => e.message).join(', ')}`,
        );
      }

      await new Promise((r) => setTimeout(r, 300));
    }
  }

  private async fetchAllFixedPriceVariantIds(
    priceListId: string,
  ): Promise<string[]> {
    const variantIds: string[] = [];
    let after: string | null = null;

    for (;;) {
      const res = await this.shopify2.gql<{
        prices: {
          nodes: { variant: { id: string } }[];
          pageInfo: { hasNextPage: boolean; endCursor?: string | null };
        };
      }>({
        connection: this.shopifyConnection,
        root: 'priceList',
        variables: { id: priceListId, first: 250, after },
        query: `#graphql
        query ($id: ID!, $first: Int!, $after: String) {
          priceList(id: $id) {
            prices(first: $first, after: $after) {
              nodes {
                variant {
                  id
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
        `,
      });

      for (const node of res?.prices?.nodes ?? []) {
        if (node.variant.id) variantIds.push(node.variant.id);
      }

      if (!res?.prices?.pageInfo?.hasNextPage) break;
      after = res.prices.pageInfo.endCursor ?? null;
      if (!after) break;
    }

    return variantIds;
  }
}
