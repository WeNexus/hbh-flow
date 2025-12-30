import { WoocommerceService } from '#lib/woocommerce/woocommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { ZohoService } from '#lib/zoho/zoho.service';
import { EnvService } from '#lib/core/env';
import { Logger } from '@nestjs/common';
import { chunk } from 'lodash-es';

@Workflow({
  name: 'Miami Distro - Inventory Sync',
  webhook: true,
  concurrency: 1,
  triggers: [
    cron('*/30 * * * *', {
      // Every 30 minutes
      timezone: 'America/New_York',
      oldPattern: '0 */2 * * *',
    }),
  ],
})
export class MiamiDistroInventorySyncWorkflow extends WorkflowBase {
  constructor(
    private readonly wooService: WoocommerceService,
    private readonly zohoService: ZohoService,
    private readonly envService: EnvService,
  ) {
    super();
  }

  private logger = new Logger(MiamiDistroInventorySyncWorkflow.name);

  async fetchInventorySummary() {
    const itemDetails: Record<string, any>[] = [];

    const rule: Record<string, any> = {
      /*columns: [
        {
          index: 1,
          field: 'location_name',
          value: ['6673885000000093096'],
          comparator: 'in',
          group: 'branch',
        },
      ],
      criteria_string: '1',*/
      columns: [],
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
        organization_id: '893457005',
        accept: 'json',
      });

      const { data } = await this.zohoService.get<Record<string, any>>(
        `/inventory/v1/reports/inventorysummary?${searchParams.toString()}`,
        {
          connection: 'miami_distro',
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
      item_id: i.item_id as string,
      sku: i.sku as string,
      item_name: i.item_name as string,
      quantity_available: Math.max(0, Number(i.quantity_available)),
      quantity_available_for_sale: Math.max(
        0,
        Number(i.quantity_available_for_sale),
      ),
    }));

    return items;
  }

  @Step(1)
  async execute() {
    if (!this.envService.isProd) {
      return this.cancel('Not running in development environment');
    }

    const items = await this.fetchInventorySummary();

    const connections = [
      'miami_distro',
      // 'savage_me_dolls',
      'the_delta_boss',
      // 'shop_full_circle',
      // 'hempthrill',
      // 'shop_be_savage',
    ];

    const results: Record<string, any>[] = [];

    if (items.length === 0) {
      return results;
    }

    const chunks = chunk(items, 200);

    this.logger.log(
      `Updating inventory for ${items.length} items in ${chunks.length} chunks`,
    );

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      for (const connection of connections) {
        this.logger.log(
          `Updating inventory for chunk ${i + 1} on connection ${connection}`,
        );

        const wooClient = this.wooService.getClient(connection);

        const res = await wooClient.put(
          'konnecthub/inventory',
          chunk.map((item) => ({
            sku: item.sku,
            stock: item.quantity_available_for_sale,
          })) as any,
        );

        results.push({ connection, status: res.status, response: res.data });
      }

      this.logger.log(`Completed chunk ${i + 1} of ${chunks.length}`);
    }

    return {
      results,
      items,
    };
  }
}

interface Item {
  item_id: string;
  sku: string;
  item_name: string;
  quantity_available: number;
  quantity_available_for_sale: number;
}
