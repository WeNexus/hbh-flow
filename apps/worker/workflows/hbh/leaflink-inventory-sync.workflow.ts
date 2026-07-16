import { LeafLinkService } from '#lib/leaflink/leaf-link.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { ZohoService } from '#lib/zoho/zoho.service';
import { EnvService } from '#lib/core/env';
import { Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { keyBy } from 'lodash-es';

interface ZohoInventoryItem {
  item_id: string;
  sku: string;
  item_name: string;
  quantity_available: number;
  quantity_available_for_sale: number;
}

interface LeafLinkProduct {
  id: number;
  sku: string;
  quantity: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Workflow({
  name: 'HBH - LeafLink Inventory Sync',
  webhook: true,
  concurrency: 1,
  triggers: [
    cron('0 */6 * * *', {
      timezone: 'America/New_York',
    }),
  ],
})
export class LeafLinkInventorySyncWorkflow extends WorkflowBase {
  private logger = new Logger(LeafLinkInventorySyncWorkflow.name);

  constructor(
    private readonly leafLinkService: LeafLinkService,
    private readonly zohoService: ZohoService,
    private readonly envService: EnvService,
  ) {
    super();
  }

  @Step(1)
  async fetchZohoInventory() {
    if (!this.envService.isProd) {
      return this.cancel('Not running in development environment');
    }

    const items: ZohoInventoryItem[] = [];

    for (let page = 1; ; page++) {
      const res = await this.zohoService.get<Record<string, any>>(
        `/inventory/v1/reports/inventorysummary?accept=json&page=${page}&per_page=5000&sort_order=A&sort_column=item_name&filter_by=TransactionDate.Today&group_by=%5B%7B%22field%22%3A%22none%22%2C%22group%22%3A%22report%22%7D%5D&show_actual_stock=true&rule=%7B%22columns%22%3A%5B%7B%22index%22%3A1%2C%22field%22%3A%22location_name%22%2C%22value%22%3A%5B%223195387000000083052%22%5D%2C%22comparator%22%3A%22in%22%2C%22group%22%3A%22branch%22%7D%5D%2C%22criteria_string%22%3A%221%22%7D&select_columns=%5B%7B%22field%22%3A%22item_name%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22sku%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_available%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_available_for_sale%22%2C%22group%22%3A%22report%22%7D%5D&usestate=true&show_sub_categories=false&response_option=1&x-zb-source=zbclient&formatneeded=true&paper_size=A4&orientation=portrait&font_family_for_body=opensans&margin_top=0.7&margin_bottom=0.7&margin_left=0.55&margin_right=0.2&table_size=classic&table_style=alternative_columns&show_org_name=true&show_generated_date=true&show_generated_time=false&show_page_number=true&show_report_basis=true&show_generated_by=true&can_fit_to_page=true&watermark_opacity=50&show_org_logo_in_header=false&show_org_logo_as_watermark=false&watermark_position=center+center&watermark_zoom=50&file_name=Inventory+Summary&organization_id=776003162&frameorigin=https%3A%2F%2Finventory.zoho.com`,
        { connection: 'hbh' },
      );

      items.push(...res.data.inventory[0].item_details);

      if (!res.data.page_context.has_more_page) break;
      await sleep(5000);
    }

    return items.filter((i) => !!i.sku);
  }

  @Step(2)
  async fetchLeafLinkProducts() {
    const products: LeafLinkProduct[] = [];
    const limit = 250;

    for (let offset = 0; ; offset += limit) {
      const res = await this.leafLinkService.get<Record<string, any>>(
        `/v2/products/?limit=${limit}&offset=${offset}`,
        { connection: 'cannadevice' },
      );

      products.push(
        ...res.data.results
          .filter((p) => !!p.sku)
          .map((p) => ({ id: p.id, sku: p.sku, quantity: p.quantity })),
      );

      if (!res.data.next) break;
    }

    return products;
  }

  @Step(3)
  async syncQuantities() {
    const zohoItems = await this.getResult('fetchZohoInventory');
    const leafLinkProducts = await this.getResult('fetchLeafLinkProducts');

    // True-parent grouping products carry the Shopify handle as their sku, so
    // they never match a Zoho item sku and are naturally left untouched here.
    const leafLinkBySku = keyBy(leafLinkProducts, 'sku');
    const results: Record<string, any>[] = [];

    for (const item of zohoItems) {
      const product = leafLinkBySku[item.sku];
      if (!product) continue;

      const targetQty = Math.max(0, Math.round(Number(item.quantity_available_for_sale)));
      const currentQty = Math.round(Number(product.quantity));
      if (targetQty === currentQty) continue;

      try {
        await this.patchQuantityWithRetry(product.id, targetQty);
        results.push({ sku: item.sku, id: product.id, from: currentQty, to: targetQty, status: 'patched' });
      } catch (e) {
        if (e instanceof AxiosError) {
          this.logger.error(`Failed to patch quantity for ${item.sku} (product ${product.id})`, e.response?.data);
        }
        results.push({
          sku: item.sku,
          id: product.id,
          status: 'failed',
          error: e instanceof AxiosError ? e.response?.data || e.message : String(e),
        });
      }

      await sleep(300);
    }

    this.logger.log(
      `Synced ${results.filter((r) => r.status === 'patched').length} / ${zohoItems.length} zoho items, ${results.filter((r) => r.status === 'failed').length} failed`,
    );

    return results;
  }

  private async patchQuantityWithRetry(
    productId: number,
    quantity: number,
    { maxRetries = 5, baseDelayMs = 2000, maxDelayMs = 30000 } = {},
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.leafLinkService.patch(
          `/v2/products/${productId}/`,
          { quantity: quantity.toFixed(4) },
          { connection: 'cannadevice' },
        );
      } catch (e) {
        const status = e instanceof AxiosError ? e.response?.status : undefined;
        const retryable = status === 429 || (!!status && status >= 500 && status < 600);
        if (!retryable || attempt >= maxRetries) throw e;

        let delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
        const retryAfter = (e as AxiosError).response?.headers?.['retry-after'];
        if (retryAfter) {
          const asSeconds = Number(retryAfter);
          delay = !Number.isNaN(asSeconds)
            ? asSeconds * 1000
            : Math.max(0, new Date(retryAfter).getTime() - Date.now());
        }

        this.logger.warn(`Retrying patch for product ${productId}, attempt ${attempt + 1}, status ${status}`);
        await sleep(delay);
      }
    }
  }
}
