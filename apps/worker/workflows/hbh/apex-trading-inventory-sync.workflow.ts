import { ApexTradingService } from '#lib/apex-trading/apex-trading.service';
import { Batch, Product } from '#lib/apex-trading/types/product';
import { PaginatedResponse } from '#lib/apex-trading/types';
import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { ZohoService } from '#lib/zoho/zoho.service';
import { MongoService } from '#lib/core/services';
import { EnvService } from '#lib/core/env';
import { Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { keyBy } from 'lodash-es';

@Workflow({
  name: 'HBH - Apex Trading Inventory Sync',
  webhook: true,
  concurrency: 1,
  triggers: [
    cron('*/30 * * * *', {
      timezone: 'America/New_York', // Every 30 minutes
    }),
  ],
})
export class ApexTradingInventorySyncWorkflow extends WorkflowBase {
  constructor(
    private readonly apexTrading: ApexTradingService,
    private readonly zohoService: ZohoService,
    private readonly envService: EnvService,
    private readonly mongo: MongoService,
  ) {
    super();
  }

  private logger = new Logger(ApexTradingInventorySyncWorkflow.name);
  private beginning = '2000-01-01T00:00:00Z';

  async getPrevTimestamp(): Promise<Date> {
    // const job = await this.getPrevJob();
    //
    // if (job) {
    //   return job.createdAt;
    // }

    return new Date(this.beginning);
  }

  @Step(1)
  validate() {
    if (!this.envService.isProd) {
      return this.cancel('Not running in development environment');
    }
  }

  @Step(2)
  async fetchInventorySummary() {
    const itemDetails: Record<string, any>[] = [];

    const rule: Record<string, any> = {
      columns: [
        /*{
          index: 1,
          field: 'location_name',
          value: ['3195387000000083052'],
          comparator: 'in',
          group: 'branch',
        },*/
      ],
      // criteria_string: '1',
    };

    if (this.payload?.sku) {
      rule.columns.push({
        // index: 2,
        index: 1,
        field: 'sku',
        value: this.payload.sku,
        comparator: 'equal',
        group: 'report',
      });

      // rule.criteria_string = '( 1 AND 2 )';
      rule.criteria_string = '1';
    }

    for (let page = 1; ; page++) {
      const searchParams = new URLSearchParams({
        page: page.toString(),
        per_page: '5000',
        sort_order: 'A',
        sort_column: 'item_name',
        filter_by: 'TransactionDate.Today',
        stock_on_hand_filter: 'All',
        group_by: JSON.stringify([{ field: 'none', group: 'report' }]),
        show_actual_stock: 'true',
        rule: JSON.stringify(rule),
        select_columns: JSON.stringify([
          { field: 'item_name', group: 'report' },
          { field: 'sku', group: 'report' },
          { field: 'quantity_available', group: 'report' },
          { field: 'quantity_available_for_sale', group: 'report' },
        ]),
        usestate: 'true',
        show_sub_categories: 'false',
        response_option: '1',
        formatneeded: 'true',
        organization_id: '776003162',
        accept: 'json',
      });

      const { data } = await this.zohoService.get<Record<string, any>>(
        `/inventory/v1/reports/inventorysummary?${searchParams.toString()}`,
        {
          connection: 'hbh',
        },
      );

      this.logger.log(
        `Fetched page ${page} with ${data.inventory[0].item_details.length} items`,
      );

      const pageCtx = data.page_context;
      const items = data.inventory[0].item_details;
      itemDetails.push(...items);

      if (
        items.length < pageCtx.per_page ||
        page >= pageCtx.total_pages ||
        itemDetails.length >= pageCtx.total
      ) {
        break;
      }
    }

    const items: Item[] = itemDetails.map((i) => ({
      sku: i.sku as string,
      quantity_available: Math.max(0, Number(i.quantity_available)),
    }));

    return items;
  }

  @Step(3)
  async storeProductIds() {
    const items = await this.getResult<Item[]>('fetchInventorySummary');

    if (!items) {
      throw new Error('No items fetched from inventory summary');
    }

    const itemsBySku = keyBy(items, 'sku');
    const timestamp = await this.getPrevTimestamp();

    for (let page = 1; ; page++) {
      const { data } = await this.apexTrading.get<
        PaginatedResponse<{ products: Product[] }>
      >(
        `/v1/products?page=${page}&per_page=200&updated_at_from=${timestamp.toISOString()}&with_batches=true&include_sold_out_batches=true`,
        {
          connection: 'dispomart',
        },
      );

      const products = data.products.filter(
        (p) =>
          Object.prototype.hasOwnProperty.call(
            itemsBySku,
            p.product_sku,
          ) as boolean,
      );

      this.logger.log(
        `Fetched page ${page} with ${data.products.length} products, storing ${products.length} matching products`,
      );

      if (products.length > 0) {
        await this.mongo
          .db('hbh')
          .collection('apex_products')
          .bulkWrite(
            products.map((p) => ({
              updateOne: {
                filter: { id: p.id },
                update: {
                  $set: {
                    id: p.id,
                    sku: p.product_sku,
                  },
                },
                upsert: true,
              },
            })),
          );
      }

      if (data.meta.last_page <= page) {
        break;
      }
    }
  }

  @Step(4)
  async execute() {
    const items = await this.getResult<Item[]>('fetchInventorySummary');

    if (!items) {
      throw new Error('No items fetched from inventory summary');
    }

    const itemsBySku = keyBy(items, 'sku');

    const products = await this.mongo
      .db('hbh')
      .collection<{ id: number; sku: string }>('apex_products')
      .find()
      .toArray()
      .then((arr) =>
        arr.reduce(
          (acc, curr) => {
            acc[curr.id] = curr.sku;
            return acc;
          },
          {} as Record<number, string>,
        ),
      );

    const timestamp = await this.getPrevTimestamp();

    const results: Record<string, any>[] = [];

    for (let page = 1; ; page++) {
      const { data } = await this.apexTrading.get<
        PaginatedResponse<{ batches: Batch[] }>
      >(
        `/v2/batches?page=${page}&per_page=200&updated_at_from=${timestamp.toISOString()}`,
        {
          connection: 'dispomart',
        },
      );

      this.logger.log(
        `Fetched page ${page} with ${data.batches.length} batches`,
      );

      for (const batch of data.batches) {
        const sku = products[batch.product_id];

        if (!sku) {
          continue;
        }

        const item = itemsBySku[sku];

        if (!item) {
          continue;
        }

        try {
          await this.apexTrading.patch(
            `/v2/batches/${batch.id}`,
            {
              quantity: Math.max(0, Number(item.quantity_available) || 0),
            },
            {
              connection: 'hbh',
            },
          );

          results.push({
            sku,
            batchId: batch.id,
            quantity: item.quantity_available,
          });
        } catch (e) {
          if (e instanceof AxiosError) {
            this.logger.error(
              `Failed to update batch ${batch.id} for SKU ${sku}: ${e.response?.data}`,
            );
          }

          results.push({
            sku,
            batchId: batch.id,
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }

      if (data.meta.last_page <= page) {
        break;
      }
    }

    return results;
  }
}

interface Item {
  sku: string;
  quantity_available: number;
}
