import { Step, Workflow } from '#lib/workflow/decorators';
import { WebhookPayloadType } from '#lib/workflow/types';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { Logger } from '@nestjs/common';
import { groupBy } from 'lodash-es';

@Workflow({
  name: 'HBH - Split DropShip items into different invoices',
  concurrency: 1,
  webhook: true,
  webhookPayloadType: WebhookPayloadType.Full,
})
export class SplitDropshipItemsWorkflow extends WorkflowBase {
  constructor(private readonly zohoService: ZohoService) {
    super();
  }

  private logger = new Logger(SplitDropshipItemsWorkflow.name);

  private customerIds = new Set(['3195387000000616206', '3195387000036669886']);
  private vendors = [
    {
      id: '3195387000039754305',
      skuPrefix: 'EW_DM-',
    },
  ];

  @Step(1)
  filterCustomers() {
    if (
      !this.customerIds.has(
        this.payload.body.salesorder?.customer_id?.toString(),
      )
    ) {
      return this.cancel('Customer is not in the list of target customers');
    }
  }

  @Step(2)
  async createInvoices() {
    const { salesorder } = this.payload.body;

    const groups = groupBy(salesorder.line_items, (item) => {
      const vendor = this.vendors.find((vendor) =>
        item.sku.startsWith(vendor.skuPrefix),
      );
      return vendor ? vendor.id : 'other';
    });

    const totalGroups = Object.keys(groups).length;
    const shippingChargePerInvoice = salesorder.shipping_charge / totalGroups;
    const discountPerInvoice = salesorder.discount / totalGroups;

    const invoices: Record<string, any> = [];

    for (const vendorId in groups) {
      const { data: result } = await this.zohoService.post<Record<string, any>>(
        `/inventory/v1/invoices`,
        {
          customer_id: salesorder.customer_id ?? salesorder.contact_id,
          salesperson_id: salesorder.salesperson_id,
          reference_number: salesorder.reference_number,
          shipping_charge: shippingChargePerInvoice,
          discount: discountPerInvoice,
          discount_type: salesorder.discount_type,
          date: salesorder.date,
          due_date: salesorder.date,
          is_inclusive_tax: false,
          billing_address_id: salesorder.billing_address_id,
          shipping_address_id: salesorder.shipping_address_id,
          delivery_method: salesorder.delivery_method,
          location_id: salesorder.location_id,
          custom_fields: [
            {
              value: salesorder.delivery_method,
              customfield_id: '3195387000070570782',
            },
          ],
          line_items: groups[vendorId].map((i) => ({
            item_id: i.item_id,
            quantity: i.quantity,
            rate: i.rate,
            location_id: i.location_id,
            salesorder_item_id: i.line_item_id,
            pricebook_id: i.pricebook_id,
          })),
        },
        {
          connection: 'hbh',
          params: {
            organization_id: '776003162',
            ignore_auto_number_generation: false,
          },
        },
      );

      invoices.push(result.invoice);
    }

    return {
      groups,
      invoices,
    };
  }

  @Step(3)
  async markInvoicesAsPaid() {
    const { invoices } = await this.getResult('createInvoices');
    const { salesorder, payment } = this.payload.body;

    const paymentResults: Record<string, any>[] = [];
    const sentResults: Record<string, any>[] = [];

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

      if (invoice.total <= 0) {
        continue;
      }

      const { data: paymentResult } = await this.zohoService.post(
        `/inventory/v1/customerpayments`,
        {
          customer_id: salesorder.customer_id ?? salesorder.contact_id,
          payment_mode:
            payment?.method === 'Authorize.Net'
              ? 'Authorize.Net'
              : 'creditcard',
          date: invoice.date,
          amount: invoice.total,
          account_id: '3195387000000000358',
          reference_number: payment?.reference_number,
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
}
