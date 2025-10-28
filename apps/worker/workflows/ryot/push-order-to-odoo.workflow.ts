import { WoocommerceService } from '#lib/woocommerce/woocommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { OdooService } from '#lib/odoo/odoo.service';
import { Customers } from 'woocommerce-rest-ts-api';
import { WorkflowBase } from '#lib/workflow/misc';
import { Logger } from '@nestjs/common';

@Workflow({
  name: 'RYOT - Push order from Woo to Odoo',
  webhook: true,
  concurrency: 1,
})
export class PushOrderToOdooWorkflow extends WorkflowBase {
  constructor(
    private readonly wooService: WoocommerceService,
    private readonly odooService: OdooService,
  ) {
    super();
  }

  private logger = new Logger(PushOrderToOdooWorkflow.name);
  private companyId = 1;

  @Step(1)
  async validate() {
    const { data: existing } = await this.odooService.post<number[]>(
      '/json/2/sale.order/search',
      {
        domain: [['client_order_ref', '=', String(this.payload.number)]],
        limit: 1,
      },
      { connection: 'ryot' },
    );

    if (existing.length) {
      return this.exit('Sales Order already exist');
    }
  }

  @Step(2)
  async fetchWooCustomer() {
    const order = this.payload;

    const client = this.wooService.getClient('miami_distro');
    const { data: wooCustomer } = await client.getCustomer(order.customer_id);

    if (!wooCustomer) {
      return this.cancel(`Could not fetch from WooCommerce`);
    }

    return wooCustomer;
  }

  @Step(3)
  async ensureCustomer() {
    const wooCustomer = (await this.getResult<Customers>('fetchWooCustomer'))!;
    // 1) Try strict by email
    let { data: odooCustomers } = await this.odooService.post<number[]>(
      '/json/2/res.partner/search',
      { domain: [['email', '=', wooCustomer.email]], limit: 1 },
      { connection: 'ryot' },
    );

    // 2) Fallback: name + phone
    if (!odooCustomers.length) {
      const name =
        `${wooCustomer.first_name ?? ''} ${wooCustomer.last_name ?? ''}`.trim();
      if (name || wooCustomer.billing?.phone) {
        const domain: any[] = [
          '&',
          ['name', '=ilike', name || ''],
          ['phone', '=ilike', wooCustomer.billing?.phone || ''],
        ];
        const { data: fallback } = await this.odooService.post<number[]>(
          '/json/2/res.partner/search',
          { domain, limit: 1 },
          { connection: 'ryot' },
        );
        odooCustomers = fallback;
      }
    }

    // Resolve countries/states for both addresses
    const billingCountryState = await this.odooService.getCountryAndStateId(
      'ryot',
      wooCustomer.billing?.country,
      wooCustomer.billing?.state,
    );
    const shippingCountryState = await this.odooService.getCountryAndStateId(
      'ryot',
      wooCustomer.shipping?.country,
      wooCustomer.shipping?.state,
    );

    // Prepare vals
    const baseVals = this.buildPartnerValsFromWoo(wooCustomer);
    const parentVals = {
      ...baseVals,
      country_id: billingCountryState.countryId,
      state_id: billingCountryState.stateId,
    };

    let parentId: number;

    if (odooCustomers.length === 1) {
      parentId = odooCustomers[0];

      // Soft update core fields
      await this.odooService.post<any>(
        '/json/2/res.partner/write',
        { ids: [parentId], vals: parentVals },
        { connection: 'ryot' },
      );
    } else {
      // Create parent
      const { data: newIds } = await this.odooService.post<number[]>(
        '/json/2/res.partner/create',
        { vals_list: [parentVals] },
        { connection: 'ryot' },
      );
      parentId = newIds[0];
    }

    // Ensure invoice child
    const invoiceVals = {
      type: 'invoice',
      name: `${baseVals.name} (Billing)`,
      parent_id: parentId,
      company_id: this.companyId,
      street: wooCustomer.billing?.address_1,
      street2: wooCustomer.billing?.address_2,
      city: wooCustomer.billing?.city,
      zip: wooCustomer.billing?.postcode,
      phone: wooCustomer.billing?.phone,
      country_id: billingCountryState.countryId,
      state_id: billingCountryState.stateId,
      email: wooCustomer.email,
    };

    // Ensure shipping child
    const shippingVals = {
      type: 'delivery',
      name: `${baseVals.name} (Shipping)`,
      parent_id: parentId,
      company_id: this.companyId,
      street: wooCustomer.shipping?.address_1 || wooCustomer.billing?.address_1,
      street2:
        wooCustomer.shipping?.address_2 || wooCustomer.billing?.address_2,
      city: wooCustomer.shipping?.city || wooCustomer.billing?.city,
      zip: wooCustomer.shipping?.postcode || wooCustomer.billing?.postcode,
      phone: wooCustomer.shipping?.phone || wooCustomer.billing?.phone,
      country_id:
        shippingCountryState.countryId || billingCountryState.countryId,
      state_id: shippingCountryState.stateId || billingCountryState.stateId,
      email: wooCustomer.email,
    };

    const ensureChild = async (type: 'invoice' | 'delivery', vals: any) => {
      const { data: childIds } = await this.odooService.post<number[]>(
        '/json/2/res.partner/search',
        {
          domain: [
            ['parent_id', '=', parentId],
            ['type', '=', type],
          ],
          limit: 1,
        },
        { connection: 'ryot' },
      );
      if (childIds.length) {
        await this.odooService.post<any>(
          '/json/2/res.partner/write',
          { ids: [childIds[0]], vals },
          { connection: 'ryot' },
        );
        return childIds[0];
      }
      const { data: newIds } = await this.odooService.post<number[]>(
        '/json/2/res.partner/create',
        { vals_list: [vals] },
        { connection: 'ryot' },
      );
      return newIds[0];
    };

    const invoiceId = await ensureChild('invoice', invoiceVals);
    const shippingId = await ensureChild('delivery', shippingVals);

    return {
      woo: wooCustomer,
      odooParent: parentId,
      odooInvoice: invoiceId,
      odooShipping: shippingId,
    };
  }

  @Step(4)
  async ensureCurrency() {
    const order = this.payload;

    // Try name match (ISO code), case-insensitive
    const { data: currencies } = await this.odooService.post<number[]>(
      '/json/2/res.currency/search',
      { domain: [['name', '=ilike', (order.currency || '').trim()]], limit: 1 },
      { connection: 'ryot' },
    );

    let currencyId: number;

    if (currencies.length) {
      currencyId = currencies[0];
    } else {
      // Create basic currency (symbol might be empty from Woo)
      const { data: newCurrencies } = await this.odooService.post<number[]>(
        '/json/2/res.currency/create',
        {
          vals_list: [
            {
              name: (order.currency || '').trim().toUpperCase(),
              symbol:
                order.currency_symbol ||
                (order.currency || '').trim().toUpperCase(),
              rounding: 0.01,
              currency_unit_label: (order.currency || '').trim().toUpperCase(),
              currency_subunit_label: 'Cent',
              active: true,
            },
          ],
        },
        { connection: 'ryot' },
      );
      currencyId = newCurrencies[0];
    }

    const pricelistId = await this.ensurePricelistForCurrency(currencyId);

    return { currencyId, pricelistId };
  }

  @Step(5)
  async createOrder() {
    const order = this.payload;

    const customer = await this.getResult<{
      woo: Customers;
      odooParent: number;
      odooInvoice: number;
      odooShipping: number;
    }>('ensureCustomer');

    const currencyData = await this.getResult<{
      currencyId: number;
      pricelistId: number;
    }>('ensureCurrency');

    if (!customer || !currencyData) {
      return this.cancel(`Customer or currency could not be created`);
    }

    // Fetch Odoo products by SKU
    const skus = (order.line_items || [])
      .map((l: any) => l.sku)
      .filter(Boolean);
    const { data: odoProducts } = await this.odooService.post<
      { id: number; default_code: string; product_tmpl_id: [number, string] }[]
    >(
      '/json/2/product.product/search_read',
      {
        domain: [['default_code', 'in', skus.length ? skus : ['__no_such__']]],
        fields: ['id', 'default_code', 'product_tmpl_id'],
        limit: 500,
      },
      { connection: 'ryot' },
    );

    const productBySku = new Map(odoProducts.map((p) => [p.default_code, p]));

    // Build tax mapper
    const taxMapper = await this.mapTaxesByWooRates(order);

    // Service products for shipping & fees
    const shippingProdId = await this.findOrCreateServiceProduct(
      'SHIPPING',
      'Shipping',
    );
    const feeProdId = await this.findOrCreateServiceProduct('FEE', 'Fee');

    // Utility to build a sale.order.line command
    const mkLine = (vals: any) => [0, 0, vals];

    // 1) Product lines (with per-line discount%)
    const productLines = (order.line_items || []).map((l: any) => {
      const qty = this.safeNumber(l.quantity, 0);
      const subtotal = this.safeNumber(l.subtotal, 0); // before discount, excl tax
      const total = this.safeNumber(l.total, subtotal); // after discount, excl tax
      const priceUnit = qty ? subtotal / qty : 0;
      const discountAbs = subtotal - total;
      const discountPct = this.percent(discountAbs, subtotal);

      const odooProduct = l.sku ? productBySku.get(l.sku) : null;

      if (!odooProduct) {
        // Create a note line to keep context
        return mkLine({
          name: `Missing SKU ${l.sku || '(none)'} — ${l.name}`,
          display_type: 'line_note',
        });
      }

      const taxIds = taxMapper(l);
      const taxCmd = taxIds.length ? [[6, 0, taxIds]] : [];

      return mkLine({
        product_id: odooProduct.id,
        product_uom_qty: qty,
        price_unit: priceUnit,
        discount: discountPct, // Odoo takes percentage
        tax_id: taxCmd.length ? taxCmd : undefined,
        name: l.name, // description from Woo
      });
    });

    // 2) Shipping lines
    const shippingLines = (order.shipping_lines || []).map((s: any) => {
      const amount = this.safeNumber(s.total, 0); // excl tax
      const taxIds = taxMapper(s);
      const taxCmd = taxIds.length ? [[6, 0, taxIds]] : [];
      return mkLine({
        product_id: shippingProdId,
        name: s.method_title || 'Shipping',
        product_uom_qty: 1,
        price_unit: amount,
        tax_id: taxCmd.length ? taxCmd : undefined,
      });
    });

    // 3) Fee lines
    const feeLines = (order.fee_lines || []).map((f: any) => {
      const amount = this.safeNumber(f.total, 0); // excl tax; may be negative for discounts-as-fee
      const taxIds = taxMapper(f);
      const taxCmd = taxIds.length ? [[6, 0, taxIds]] : [];
      return mkLine({
        product_id: feeProdId,
        name: f.name || 'Fee',
        product_uom_qty: 1,
        price_unit: amount,
        tax_id: taxCmd.length ? taxCmd : undefined,
      });
    });

    // 4) Coupon summary note (optional)
    const couponNote = (order.coupon_lines || []).length
      ? mkLine({
          display_type: 'line_note',
          name:
            'Coupons: ' +
            (order.coupon_lines || [])
              .map(
                (c: any) =>
                  `${c.code}: -${this.safeNumber(c.discount, 0)}${order.currency}`,
              )
              .join(', '),
        })
      : null;

    // Compose all lines
    const order_line = [
      ...productLines,
      ...(shippingLines || []),
      ...(feeLines || []),
      ...(couponNote ? [couponNote] : []),
    ].filter(Boolean);

    // Craft meta note
    const metaBlocks: string[] = [];
    if (order.payment_method_title)
      metaBlocks.push(`Payment Method: ${order.payment_method_title}`);
    if (order.transaction_id)
      metaBlocks.push(`Transaction ID: ${order.transaction_id}`);
    if (order.shipping_lines?.length) {
      const methods = order.shipping_lines
        .map((s: any) => s.method_title)
        .filter(Boolean)
        .join(', ');
      if (methods) metaBlocks.push(`Shipping Method(s): ${methods}`);
    }
    if (order.customer_note)
      metaBlocks.push(`Customer Note: ${order.customer_note}`);

    const note = metaBlocks.join('\n');

    // Build SO vals
    const vals = {
      name: String(order.number),
      company_id: this.companyId,
      partner_id: customer.odooParent,
      partner_invoice_id: customer.odooInvoice,
      partner_shipping_id: customer.odooShipping,
      currency_id: currencyData.currencyId,
      pricelist_id: currencyData.pricelistId,
      client_order_ref: String(order.number),
      order_line,
      note,
    };

    const { data: odooOrderIds } = await this.odooService.post<number[]>(
      '/json/2/sale.order/create',
      { vals_list: [vals] },
      { connection: 'ryot' },
    );

    return odooOrderIds[0];
  }

  @Step(6)
  async sendQuotation() {
    const odooOrderId = await this.getResult<number>('createOrder');

    if (!odooOrderId) {
      return this.cancel('No Odoo order id to email.');
    }

    // Ask Odoo for the default template/context
    const { data: action } = await this.odooService.post<any>(
      '/json/2/sale.order/action_quotation_send',
      { ids: [odooOrderId] },
      { connection: 'ryot' },
    );

    const ctx = action?.context || {};
    const templateId =
      ctx.default_template_id || ctx.template_id || ctx.default_templateId;

    if (!templateId) {
      // No template returned – at least mark the quotation as "sent"
      await this.odooService.post(
        '/json/2/sale.order/action_quotation_sent',
        { ids: [odooOrderId] },
        { connection: 'ryot' },
      );

      return { odooOrderId, emailed: false, reason: 'no_template' };
    }

    // Send the quotation
    await this.odooService.post(
      '/json/2/mail.template/send_mail',
      {
        ids: [templateId],
        res_id: odooOrderId,
        force_send: true,
        context: ctx,
      },
      { connection: 'ryot' },
    );

    // Ensure SO is marked as "Quotation Sent"
    await this.odooService.post(
      '/json/2/sale.order/action_quotation_sent',
      { ids: [odooOrderId] },
      { connection: 'ryot' },
    );

    return { odooOrderId, emailed: true };
  }

  @Step(4)
  async confirmOrder() {
    const odooOrderId = await this.getResult<number>('createOrder');

    if (!odooOrderId) {
      return this.cancel('No Odoo order id to confirm.');
    }

    await this.odooService.post(
      '/json/2/sale.order/action_confirm',
      { ids: [odooOrderId] },
      { connection: 'ryot' },
    );

    return { odooOrderId, confirmed: true };
  }

  private async findOrCreateServiceProduct(code: string, name: string) {
    const { data: prodIds } = await this.odooService.post<number[]>(
      '/json/2/product.product/search',
      { domain: [['default_code', '=', code]], limit: 1 },
      { connection: 'ryot' },
    );

    if (prodIds.length) return prodIds[0];

    const { data: tmplIds } = await this.odooService.post<number[]>(
      '/json/2/product.template/create',
      {
        vals_list: [
          {
            name,
            type: 'service',
            default_code: code,
            sale_ok: true,
            purchase_ok: false,
            company_id: this.companyId,
          },
        ],
      },
      { connection: 'ryot' },
    );

    // Fetch the product.product associated with the new template
    const { data: newProdIds } = await this.odooService.post<number[]>(
      '/json/2/product.product/search',
      { domain: [['product_tmpl_id', '=', tmplIds[0]]], limit: 1 },
      { connection: 'ryot' },
    );
    return newProdIds[0];
  }

  private percent(n: number, d: number) {
    if (!d || d === 0) return 0;
    return Math.max(0, Math.min(100, (n / d) * 100));
  }

  private safeNumber(x: any, fallback = 0) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  }

  private async mapTaxesByWooRates(wooOrder: any) {
    // Build a map: Woo tax_rate_id -> percentage (as number)
    const byRateId: Record<string, number> = {};
    (wooOrder.tax_lines || []).forEach((t: any) => {
      // Woo tax rate percent typically lives in t.rate_percent or derived from name; many stores keep it as 'rate' string
      const p = this.safeNumber(t.rate_percent ?? t.rate ?? 0);
      if (p > 0) byRateId[String(t.rate_id ?? t.id)] = p;
    });

    if (!Object.keys(byRateId).length) return (_line: any) => [] as number[];

    const taxDomain: any[] = [
      '|',
      ['type_tax_use', '=', 'sale'],
      ['type_tax_use', '=', 'none'],
    ];
    const { data: taxes } = await this.odooService.post<any[]>(
      '/json/2/account.tax/search_read',
      {
        domain: taxDomain,
        fields: [
          'id',
          'amount',
          'amount_type',
          'active',
          'price_include',
          'name',
        ],
        limit: 200,
      },
      { connection: 'ryot' },
    );

    // Index by rounded percent for quick match
    const byPct: Record<string, number> = {};
    for (const t of taxes) {
      if (!t.active) continue;
      if (t.amount_type !== 'percent') continue;
      const key = String(
        Math.round(this.safeNumber(t.amount, 0) * 1000) / 1000,
      );
      byPct[key] = t.id;
    }

    // Return a function that, given a woo line, returns Odoo tax ids applied to that line
    return (line: any) => {
      const taxIds: number[] = [];
      const taxObj =
        line.taxes || line.tax_lines || line.taxes_data || line.taxes_info;
      // Woo line may hold taxes as [{id: rate_id, total, subtotal}] in line.taxes
      const lineTaxes = Array.isArray(line.taxes) ? line.taxes : [];

      if (lineTaxes.length) {
        for (const lt of lineTaxes) {
          const rid = String(lt.id ?? lt.rate_id ?? '');
          const pct = byRateId[rid];
          if (pct != null) {
            const key = String(Math.round(pct * 1000) / 1000);
            const found = byPct[key];
            if (found) taxIds.push(found);
          }
        }
      } else {
        // If no per-line breakdown, fallback: apply all order-level taxes
        for (const [rid, pct] of Object.entries(byRateId)) {
          const key = String(Math.round(pct * 1000) / 1000);
          const found = byPct[key];
          if (found) taxIds.push(found);
        }
      }

      return Array.from(new Set(taxIds));
    };
  }

  private async ensurePricelistForCurrency(currencyId: number) {
    // Try to find an existing pricelist in this currency
    const { data: pls } = await this.odooService.post<any[]>(
      '/json/2/product.pricelist/search_read',
      {
        domain: [
          ['currency_id', '=', currencyId],
          ['active', '=', true],
          ['company_id', '=', this.companyId],
        ],
        fields: ['id', 'name'],
        limit: 1,
      },
      { connection: 'ryot' },
    );
    if (pls.length) return pls[0].id;

    // Create a simple pricelist for this currency
    const { data: newPl } = await this.odooService.post<number[]>(
      '/json/2/product.pricelist/create',
      {
        vals_list: [
          {
            name: `Auto PL ${currencyId}`,
            currency_id: currencyId,
            company_id: this.companyId,
          },
        ],
      },
      { connection: 'ryot' },
    );
    return newPl[0];
  }

  private buildPartnerValsFromWoo(woo: Customers) {
    const name =
      `${woo.first_name ?? ''} ${woo.last_name ?? ''}`.trim() ||
      woo.username ||
      woo.email;

    return {
      active: true,
      is_company: false,
      company_id: this.companyId,
      name,
      email: woo.email,
      phone: woo.billing?.phone || woo.shipping?.phone,
      vat:
        (woo.meta_data || []).find(
          (m: any) => m.key === 'vat' || m.key === 'tax_id',
        )?.value ?? null,
      website: woo.billing?.company ? null : woo.username, // tweak as you wish
      // general address (fallback to billing)
      street: woo.billing?.address_1,
      street2: woo.billing?.address_2,
      city: woo.billing?.city,
      zip: woo.billing?.postcode,
    };
  }
}
