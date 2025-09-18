import { WoocommerceService } from '#lib/woocommerce/woocommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { ZohoService } from '#lib/zoho/zoho.service';
import { EnvService } from '#lib/core/env';
import { chunk } from 'lodash-es';

@Workflow({
  webhook: true,
  name: 'Sync HBH Inventory with Miami Distro',
  triggers: [cron('0 */4 * * *', { timezone: 'America/New_York' })], // every 4 hours
})
export class SyncInventoryWithMiamiDistroWorkflow extends WorkflowBase {
  constructor(
    private readonly woocommerceService: WoocommerceService,
    private readonly zohoService: ZohoService,
    private readonly env: EnvService,
  ) {
    super();
  }

  @Step(1)
  async pullSKUsFromInventory() {
    if (!this.env.isProd) {
      return this.cancel('Not running in development environment');
    }

    const jobToken = await this.pause();
    const callbackUrl = `${this.env.getString('APP_URL')}/api/jobs/${this.dbJob.id}/resume?token=${jobToken}`;

    const params = encodeURIComponent(
      JSON.stringify({
        callbackUrl,
        responseFormat: 'json',
        sqlQuery: `SELECT i."Item ID" as id, i."Vendor Supplier Code" as sku, s."quantity_available_for_sale" as qty
                   FROM "Items" as i
                          JOIN "Tampa Live QTY Available" s ON i."Item ID" = s."item_id"
                   WHERE i."Preferred Vendor" = 3195387000137306636`,
      }),
    );

    const res = await this.zohoService.get(
      `/restapi/v2/bulk/workspaces/2556056000000249007/data?CONFIG=${params}`,
      {
        baseURL: 'https://analyticsapi.zoho.com',
        connection: 'hbh',
        headers: {
          'ZANALYTICS-ORGID': '776004901',
        },
      },
    );

    return res.data;
  }

  @Step(2)
  async updateInventory() {
    const exportJob = await this.getResumeData<any>('pullSKUsFromInventory');

    const { data: zohoItems } = await this.zohoService.get(
      exportJob.downloadUrl,
      {
        baseURL: 'https://analyticsapi.zoho.com',
        connection: 'hbh',
        headers: {
          'ZANALYTICS-ORGID': '776004901',
        },
      },
    );

    const chunks = chunk(
      zohoItems.data.map((item: any) => item.sku),
      20,
    );

    const woo = this.woocommerceService.getClient('miami_distro');

    const adjustments: any[] = [];

    for (const skus of chunks) {
      const { data: products } = await woo.getProducts({
        sku: skus.join(','),
      });

      for (const product of products) {
        const zohoItem = zohoItems.data.find(
          (item: any) => item.sku.toLowerCase() === product.sku.toLowerCase(),
        );

        if (!zohoItem) {
          console.log('No inventory item found for SKU:', product.sku);
          continue;
        }

        const zohoQty = Number(zohoItem.qty || 0);
        const wooQty = Number(product.stock_quantity || 0);

        if (zohoQty !== wooQty) {
          adjustments.push({
            item_id: zohoItem.id,
            quantity_adjusted: wooQty - zohoQty,
            location_id: '3195387000000083052',
          });
        }
      }
    }

    if (adjustments.length === 0) {
      return { message: 'No adjustments needed' };
    }

    const { data } = await this.zohoService.post(
      `/inventory/v1/inventoryadjustments`,
      {
        adjustment_type: 'quantity',
        date: new Intl.DateTimeFormat('en-CA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          timeZone: 'America/New_York',
        }).format(new Date()),
        reason: 'Sync with the source',
        line_items: adjustments,
      },
      {
        connection: 'hbh',
        params: {
          organization_id: '776003162',
        },
      },
    );

    return data;
  }
}
