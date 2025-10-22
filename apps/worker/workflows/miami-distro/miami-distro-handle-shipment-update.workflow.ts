import { Step, Workflow } from '#lib/workflow/decorators';
import { WebhookPayloadType } from '#lib/workflow/types';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { Logger } from '@nestjs/common';

@Workflow({
  name: 'Miami Distro - Send Shipment updates to Cliq Channel',
  webhook: true,
  concurrency: 10,
  webhookPayloadType: WebhookPayloadType.Full,
})
export class MiamiDistroHandleShipmentUpdateWorkflow extends WorkflowBase {
  constructor(private readonly zohoService: ZohoService) {
    super();
  }

  private logger = new Logger(MiamiDistroHandleShipmentUpdateWorkflow.name);

  @Step(1)
  async execute() {
    const shipment = this.payload.body.shipmentorder;
    const salesRep = this.payload.query.sales_rep;

    const payload = {
      text: "An order's shipment status has changed.",
      card: {
        title: `Order ${shipment.salesorder_number} — ${shipment.status_formatted.trim()}`,
        theme: 'modern-inline',
      },
      slides: [
        {
          type: 'label',
          title: 'Details',
          data: [
            { Carrier: shipment.carrier },
            { 'Tracking Number': shipment.tracking_number },
            { Company: shipment.customer_name },
            salesRep ? { 'Sales Rep': salesRep } : null,
          ].filter(Boolean),
        },
        shipment.invoices.length
          ? {
              type: 'list',
              title: 'Invoices',
              data: shipment.invoices.map(
                (i) =>
                  `[${i.invoice_number}](https://inventory.zoho.com/app/893457005#/invoices/${i.invoice_id})`,
              ),
            }
          : null,
        {
          type: 'list',
          title: 'Packages',
          data: shipment.packages.map(
            (i) =>
              `[${i.package_number}](https://inventory.zoho.com/app/893457005#/packages/${i.package_id})`,
          ),
        },
      ].filter(Boolean),
      buttons: [
        {
          label: 'Open',
          hint: '',
          type: '+',
          action: {
            type: 'open.url',
            data: {
              web: `https://inventory.zoho.com/app/893457005#/shipments/${shipment.shipment_id}`,
            },
          },
        },
      ],
    };

    await this.zohoService.notifySubscribers({
      connection: 'miami_distro',
      topic: 'shipment_status_changed',
      payload,
    });
  }
}
