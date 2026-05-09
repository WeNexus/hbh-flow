import { ApexTradingService } from '#lib/apex-trading/apex-trading.service';
import { PaginatedResponse } from '#lib/apex-trading/types';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WebhookPayloadType } from '#lib/workflow/types';
import { Order } from '#lib/apex-trading/types/order';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { Logger } from '@nestjs/common';

@Workflow({
    name: 'HBH - Push Books payment to Apex',
    webhook: true,
    concurrency: 1,
    webhookPayloadType: WebhookPayloadType.Body,
})
export class PushPaymentToApexWorkflow extends WorkflowBase {
    private logger = new Logger(PushPaymentToApexWorkflow.name);

    private paymentModeMap: Partial<
        Record<
            | 'Cash'
            | 'Check'
            | 'Credit Card'
            | 'ACH'
            | 'Wire'
            | 'Escrow'
            | 'Venmo'
            | 'Cash App'
            | 'Zelle'
            | 'Money Order',
            Set<string>
        >
    > = {
            Cash: new Set(['COD', 'Cash']),
            Check: new Set(['Check']),
            'Credit Card': new Set([
                'Card',
                'Credit Card',
                'Debit Card',
                'creditcard',
                'Authorize.Net',
            ]),
            ACH: new Set(['Bank Transfer', 'Netbanking', 'Bank Transfer | Wire']),
            Wire: new Set(['Wire', 'Bank Transfer | Wire']),
            'Money Order': new Set(['Money Order']),
        };

    constructor(
        private readonly zoho: ZohoService,
        private readonly apexTrading: ApexTradingService,
    ) {
        super();
    }

    @Step(1)
    validate() {
        if (this.payload.payment.retainerinvoice?.retainerinvoice_id) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return this.payload.payment;
        }

        this.cancel(
            `Payment ${this.payload.payment.payment_id} does not have a retainer invoice associated with it`,
        );
    }

    @Step(2)
    async fetchRetainerInvoice(): Promise<Record<string, any>> {
        const {
            data: { retainerinvoice },
        } = await this.zoho.get<Record<string, any>>(
            `/books/v3/retainerinvoices/${this.payload.payment.retainerinvoice.retainerinvoice_id}`,
            {
                connection: 'hbh',
                params: {
                    organization_id: '776003162',
                },
            },
        );

        if (!(retainerinvoice.reference_number as string).startsWith('APM_CD-')) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return this.cancel(
                `Retainer Invoice ${retainerinvoice.retainerinvoice_id} does not have a reference number starting with APM_CD-`,
            ) as any;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return retainerinvoice;
    }

    @Step(3)
    async fetchApexOrder() {
        const retainerInvoice = await this.getResult('fetchRetainerInvoice');

        const { data } = await this.apexTrading.get<
            PaginatedResponse<{ orders: Order[] }>
        >(
            `/v1/shipping-orders?page=1&per_page=1&updated_at_from=2000-03-08T15:58:10.000000Z&invoice_number=${retainerInvoice.reference_number}`,
            {
                connection: 'dispomart',
            },
        );

        const [order] = data.orders;

        if (!order) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return this.cancel(
                `No Apex order found for retainer invoice ${retainerInvoice.retainerinvoice_id}`,
            ) as any;
        }

        this.logger.log(
            `Found Apex order ${order.id} for retainer invoice ${retainerInvoice.retainerinvoice_id}`,
        );

        return order;
    }

    @Step(4)
    async createPayment() {
        const apexOrder = await this.getResult<Order>('fetchApexOrder');

        let paymentType: string | undefined = undefined;

        for (const key in this.paymentModeMap) {
            if (this.paymentModeMap[key].has(this.payload.payment.payment_mode)) {
                paymentType = key;
                break;
            }
        }

        const { data } = await this.apexTrading.post(
            `/v1/shipping-orders/${apexOrder!.id}/payments`,
            {
                amount: this.payload.payment.amount,
                type: 'payment',
                payment_date: this.payload.payment.date,
                pay_type: paymentType,
            },
            {
                connection: 'dispomart',
            },
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return data;
    }
}
