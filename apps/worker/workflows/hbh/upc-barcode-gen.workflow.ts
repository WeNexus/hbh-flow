import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WebhookPayloadType } from '#lib/workflow/types';
import { WorkflowBase } from '#lib/workflow/misc';
import { createCanvas, loadImage } from 'canvas';
import SVGtoPDF from 'svg-to-pdfkit';
import ZipStream from 'zip-stream';
import JsBarcode from 'jsbarcode';
import PDFDocument from 'pdfkit';
import { z } from 'zod';

@Workflow({
  name: 'HBH - UPC Barcode Generator',
  concurrency: 50,
  webhook: true,
  webhookPayloadType: WebhookPayloadType.Query,
})
export class UpcBarcodeGenWorkflow extends WorkflowBase {
  private readonly schema = z
    .object({
      // sku could be comma separated list of SKUs
      sku: z
        .string()
        .optional()
        .transform((val) => {
          const trimmed = val?.trim();
          if (!trimmed) return [] as string[];

          return trimmed
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }),
      type: z.enum(['UPC', 'CODE39']).default('UPC'),
      value: z.string().transform((val) => {
        const trimmed = val.trim();
        if (!trimmed) return [] as string[];

        return trimmed
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }),
      fileType: z.enum(['pdf-zip', 'pdf', 'svg', 'png']).default('pdf'),
      width: z
        .string()
        .transform(Number)
        .refine((v) => v >= 10, 'Width must be at least 10 points')
        .optional(), // standard UPC label width in points
      height: z
        .string()
        .transform(Number)
        .refine((v) => v >= 10, 'Height must be at least 10 points')
        .optional(), // standard UPC label height in points
    })
    .superRefine((val, ctx) => {
      // 2. There must be at least one value and one SKU
      if (!val.value.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'At least one value is required.',
        });
      }

      // Basic UPC sanity check: 12 numeric digits
      if (val.type === 'UPC') {
        val.value.forEach((code, index) => {
          if (!/^\d{12}$/.test(code)) {
            ctx.addIssue({
              code: 'custom',
              path: ['upc', index],
              message: `UPC at index ${index} must be 12 numeric digits.`,
            });
          }
        });
      } else if (val.type === 'CODE39') {
        // Basic CODE39 sanity check: only valid characters
        const CODE39_REGEX = /^[0-9A-Z \-.$/+%]*$/;
        val.value.forEach((code, index) => {
          if (!CODE39_REGEX.test(code)) {
            ctx.addIssue({
              code: 'custom',
              path: ['value'],
              message: `CODE39 at index ${index} contains invalid characters.`,
            });
          }
        });
      }
    });

  private getSvgIntrinsicSize(svg: string): { svgW: number; svgH: number } {
    // Extract attributes
    const attr = (name: string) => {
      const m = svg.match(new RegExp(`${name}="([^"]+)"`));
      return m ? m[1] : '';
    };

    const toPts = (v: string): number => {
      if (!v) return NaN;
      const m = v.trim().match(/^([\d.]+)(px|pt|mm|cm|in)?$/i);
      if (!m) return NaN;
      const val = parseFloat(m[1]);
      const unit = (m[2] || 'px').toLowerCase();
      switch (unit) {
        case 'pt':
          return val;
        case 'px':
          return val; // treat px ≈ pt
        case 'in':
          return val * 72;
        case 'mm':
          return (val / 25.4) * 72;
        case 'cm':
          return (val / 2.54) * 72;
        default:
          return val;
      }
    };

    let w = toPts(attr('width'));
    let h = toPts(attr('height'));

    if (!(w > 0 && h > 0)) {
      const vb = attr('viewBox');

      if (vb) {
        const parts = vb.split(/\s+/).map(Number);
        if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
          const [, , vbW, vbH] = parts;
          w = vbW || w;
          h = vbH || h;
        }
      }
    }

    // Defaults if the SVG didn’t set size
    if (!(w > 0)) w = 600;
    if (!(h > 0)) h = 200;

    return { svgW: w, svgH: h };
  }

  private renderSvgToPDFPage(
    svg: string,
    doc: typeof PDFDocument,
    pageWidth: number,
    pageHeight: number,
  ) {
    // Measure the SVG’s intrinsic size (width/height or viewBox)
    const { svgW, svgH } = this.getSvgIntrinsicSize(svg);

    // Scale to fit the fixed page while preserving aspect
    const scale = Math.min(pageWidth / svgW, pageHeight / svgH);
    const renderW = svgW * scale;
    const renderH = svgH * scale;

    // Center on the page
    const x = (pageWidth - renderW) / 2;
    const y = (pageHeight - renderH) / 2;

    doc.addPage({ size: [pageWidth, pageHeight], margin: 0 });

    // Draw SVG with explicit width/height to enforce the scale
    SVGtoPDF(doc, svg, x, y, {
      width: renderW,
      height: renderH,
      preserveAspectRatio: 'xMidYMid meet',
    });
  }

  private async svgToPNG(svg: string) {
    const { svgW, svgH } = this.getSvgIntrinsicSize(svg);
    const SCALE = 4;

    const canvas = createCanvas(svgW * SCALE, svgH * SCALE);
    const ctx = canvas.getContext('2d');

    // For crisp bar edges
    // (helps a bit for barcodes if there’s any resampling)
    ctx.imageSmoothingEnabled = false;
    ctx.patternQuality = 'fast';

    const img = await loadImage(
      'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
    );

    // Render the SVG directly at the target pixel size
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas.toBuffer('image/png');
  }

  /*private generateBarcodeSvg(upc: string, sku?: string): string {
    const xmlSerializer = new XMLSerializer();
    const document = new DOMImplementation().createDocument(
      'http://www.w3.org/1999/xhtml',
      'html',
      null,
    );
    const svgNode = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    );

    const MAX_FONT = 24;
    const MIN_FONT = 6; // very small, but allows “no matter the length”
    const SKU_PADDING = 12;

    const baseOptions = {
      xmlDocument: document,
      format: 'UPC' as const,
      background: '#FFFFFF',
      lineColor: '#000000',
      fontSize: 18, // UPC digits font size
      height: 128,
      width: 2,
      margin: 10,
      textMargin: -2,
      displayValue: true,
      font: 'Helvetica, Arial, sans-serif',
      fontOptions: '',
      textAlign: 'center' as const,
    };

    // First render so JsBarcode decides intrinsic width (and draws digits)
    JsBarcode(svgNode, upc, {
      ...baseOptions,
      marginTop: 10,
    });

    // No SKU: just return the basic barcode
    if (!sku) {
      svgNode.setAttribute('style', 'shape-rendering:crispEdges');
      return xmlSerializer.serializeToString(svgNode);
    }

    // --- Width estimation helpers ---
    const CHAR_WIDTH_FACTOR = 0.58; // approximate average glyph width in ems

    // 1. Estimate width of the UPC digits (this is our target width)
    const upcTextWidth = 24 * baseOptions.fontSize * CHAR_WIDTH_FACTOR;

    // 2. Pick SKU font size so its estimated width == UPC digits width
    let fontSize = upcTextWidth / (sku.length * CHAR_WIDTH_FACTOR);

    if (fontSize > MAX_FONT) fontSize = MAX_FONT;
    if (fontSize < MIN_FONT) fontSize = MIN_FONT;

    // Total vertical space reserved for SKU above the bars
    const marginTop = fontSize + SKU_PADDING * 2;

    // Center the glyphs vertically in that region.
    const ASCENT_RATIO = 0.8;
    const centerOffset = (ASCENT_RATIO - 0.5) * fontSize;
    const textBaselineY = marginTop / 2 + centerOffset;

    // Re-render barcode with extra margin on top
    while (svgNode.firstChild) {
      svgNode.removeChild(svgNode.firstChild);
    }

    JsBarcode(svgNode, upc, {
      ...baseOptions,
      marginTop,
    });

    svgNode.setAttribute('style', 'shape-rendering:crispEdges');

    const skuText = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'text',
    );

    skuText.setAttribute('x', '50%');
    skuText.setAttribute('y', String(textBaselineY));
    skuText.setAttribute('text-anchor', 'middle');
    skuText.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
    skuText.setAttribute('font-size', String(fontSize));
    skuText.setAttribute('fill', '#000000');
    skuText.textContent = sku;

    // IMPORTANT: no textLength / lengthAdjust here → no stretching/compressing
    // We rely purely on font-size scaling to match the approximate width.

    // Draw on top so it's never hidden
    svgNode.appendChild(skuText);

    return xmlSerializer.serializeToString(svgNode);
  }*/

  // Old version kept for reference
  /*private generateBarcodeSvg(upc: string, sku?: string): string {
    const xmlSerializer = new XMLSerializer();
    const document = new DOMImplementation().createDocument(
      'http://www.w3.org/1999/xhtml',
      'html',
      null,
    );
    const svgNode = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    );

    const MAX_FONT = 24;
    const MIN_FONT = 10;
    const SKU_PADDING = 12;

    const baseOptions = {
      xmlDocument: document,
      format: 'UPC' as const,
      background: '#FFFFFF',
      lineColor: '#000000',
      fontSize: 18,
      height: 128,
      width: 2,
      margin: 10,
      textMargin: -2,
      displayValue: true,
      font: 'Helvetica, Arial, sans-serif',
      fontOptions: '',
      textAlign: 'center' as const,
    };

    // First render so JsBarcode decides intrinsic width
    JsBarcode(svgNode, upc, {
      ...baseOptions,
      marginTop: 10,
    });

    // available width from SVG (width or viewBox)
    let availableWidth = parseFloat(svgNode.getAttribute('width') || '') || 0;
    if (!availableWidth) {
      const vb = svgNode.getAttribute('viewBox');
      if (vb) {
        const parts = vb.split(/\s+/).map(Number);
        if (parts.length === 4 && !Number.isNaN(parts[2])) {
          availableWidth = parts[2];
        }
      }
    }
    if (!availableWidth) availableWidth = 600;

    // No SKU: just return the basic barcode
    if (!sku) {
      svgNode.setAttribute('style', 'shape-rendering:crispEdges');
      return xmlSerializer.serializeToString(svgNode);
    }

    const SIDE_MARGIN = 10;
    const maxTextWidth = Math.max(10, availableWidth - SIDE_MARGIN * 2);

    // Rough width estimate: characters * em-width factor
    const CHAR_WIDTH_FACTOR = 0.58;
    const FIT_SAFETY = 0.98; // leave a little room

    const estimateWidth = (text: string, fontSize: number) =>
      text.length * fontSize * CHAR_WIDTH_FACTOR;

    // --- 1. Choose font size to FILL the width (up to MAX_FONT) ---
    let fontSize =
      (maxTextWidth * FIT_SAFETY) / (sku.length * CHAR_WIDTH_FACTOR);

    if (fontSize > MAX_FONT) fontSize = MAX_FONT;
    if (fontSize < MIN_FONT) fontSize = MIN_FONT;

    // Total vertical space reserved for SKU above the bars
    const marginTop = fontSize + SKU_PADDING * 2;

    // Center the *glyphs* vertically in that region.
    // Approximate ascent ≈ 0.8 of fontSize.
    const ASCENT_RATIO = 0.8;
    const centerOffset = (ASCENT_RATIO - 0.5) * fontSize;
    const textBaselineY = marginTop / 2 + centerOffset;

    // Re-render barcode with extra margin on top
    while (svgNode.firstChild) {
      svgNode.removeChild(svgNode.firstChild);
    }

    JsBarcode(svgNode, upc, {
      ...baseOptions,
      marginTop,
    });

    svgNode.setAttribute('style', 'shape-rendering:crispEdges');

    const skuText = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'text',
    );

    skuText.setAttribute('x', '50%');
    skuText.setAttribute('y', String(textBaselineY));
    skuText.setAttribute('text-anchor', 'middle');
    skuText.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
    skuText.setAttribute('font-size', String(fontSize));
    skuText.setAttribute('fill', '#000000');
    skuText.textContent = sku;

    const estWidth = estimateWidth(sku, fontSize);

    // --- 2. Only compress/stretch horizontally if we *must* ---
    if (estWidth > maxTextWidth * FIT_SAFETY) {
      // Too long even at min/max font size: fit by scaling + slight spacing change
      skuText.setAttribute('textLength', String(maxTextWidth));
      skuText.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    }
    // NOTE: no special handling when text is short; we just let it be
    // its natural width, so there is no weird expanded spacing.

    // Draw on top so it's never hidden
    svgNode.appendChild(skuText);

    return xmlSerializer.serializeToString(svgNode);
  }*/

  // Original
  private generateBarcodeSvg(
    upc: string,
    type: 'UPC' | 'CODE39',
    sku?: string,
  ): string {
    const xmlSerializer = new XMLSerializer();
    const document = new DOMImplementation().createDocument(
      'http://www.w3.org/1999/xhtml',
      'html',
      null,
    );
    const svgNode = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg',
    );

    const MAX_FONT = 24;
    const SKU_PADDING = 12;

    const baseOptions: JsBarcode.Options = {
      xmlDocument: document,
      format: this.payload,
      background: '#FFFFFF',
      lineColor: '#000000',
      fontSize: 18,
      height: 128,
      width: 2,
      margin: 10,
      textMargin: -2,
      displayValue: true,
      font: 'Helvetica, Arial, sans-serif',
      fontOptions: '',
      textAlign: 'center',
    };

    // First render just to let JsBarcode decide the intrinsic width.
    JsBarcode(svgNode, upc, {
      ...baseOptions,
      marginTop: 10,
    });

    // available width from SVG (width or viewBox)
    let availableWidth = parseFloat(svgNode.getAttribute('width') || '') || 0;
    if (!availableWidth) {
      const vb = svgNode.getAttribute('viewBox');
      if (vb) {
        const parts = vb.split(/\s+/).map(Number);
        if (parts.length === 4 && !Number.isNaN(parts[2])) {
          availableWidth = parts[2];
        }
      }
    }
    if (!availableWidth) availableWidth = 600;

    // No SKU: just return the basic barcode
    if (!sku) {
      svgNode.setAttribute('style', 'shape-rendering:crispEdges');
      return xmlSerializer.serializeToString(svgNode);
    }

    const SIDE_MARGIN = 10;
    const maxTextWidth = Math.max(10, availableWidth - SIDE_MARGIN * 2);
    const CHAR_WIDTH_FACTOR = 0.58;
    const FIT_SAFETY = 0.98;

    const SPACING_MIN_RATIO = 0.7;

    const estimateWidth = (text: string, fontSize: number) =>
      text.length * fontSize * CHAR_WIDTH_FACTOR;

    let fontSize = MAX_FONT;
    while (
      fontSize > 10 &&
      estimateWidth(sku, fontSize) > maxTextWidth * FIT_SAFETY
    ) {
      fontSize -= 1;
    }

    const marginTop = fontSize + SKU_PADDING * 2;
    const textBaselineY = SKU_PADDING + fontSize;

    while (svgNode.firstChild) {
      svgNode.removeChild(svgNode.firstChild);
    }

    JsBarcode(svgNode, upc, {
      ...baseOptions,
      marginTop,
    });

    svgNode.setAttribute('style', 'shape-rendering:crispEdges');

    const skuText = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'text',
    );

    skuText.setAttribute('x', '50%');
    skuText.setAttribute('y', String(textBaselineY));
    skuText.setAttribute('text-anchor', 'middle');
    skuText.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
    skuText.setAttribute('font-size', String(fontSize));
    skuText.setAttribute('fill', '#000000');
    skuText.textContent = sku;

    const est = estimateWidth(sku, fontSize);
    const ratio = est / maxTextWidth;

    if (ratio >= 1) {
      skuText.setAttribute('textLength', String(maxTextWidth));
      skuText.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    } else if (ratio >= SPACING_MIN_RATIO) {
      skuText.setAttribute('textLength', String(maxTextWidth));
      skuText.setAttribute('lengthAdjust', 'spacing');
    }

    // Draw on top so it's never hidden
    svgNode.appendChild(skuText);

    return xmlSerializer.serializeToString(svgNode);
  }

  @Step(1)
  async execute() {
    if (this.responseEndSent) {
      return this.cancel(`Response already sent, cancelling workflow.`);
    }

    const { data: payload, error } = this.schema.safeParse(this.payload);

    if (error || !payload) {
      await this.sendResponseMeta({
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
      });

      return this.sendResponse(
        JSON.stringify({
          error: 'Invalid input',
          details: error.issues.map((i) => i.message),
        }),
        true,
      );
    }

    const sanitizeForFilename = (value: string) =>
      value.replace(/[^a-zA-Z0-9_.-]+/g, '_');

    const filenameParts =
      payload.sku && payload.sku.length ? payload.sku : payload.value;

    const baseFilename =
      filenameParts.length > 0
        ? filenameParts.map(sanitizeForFilename).join('__')
        : 'barcodes';

    const extension =
      payload.fileType === 'pdf-zip'
        ? 'zip'
        : payload.fileType === 'pdf'
          ? 'pdf'
          : payload.value.length > 1
            ? 'zip'
            : payload.fileType;

    if (!this.responseMetaSent) {
      const contentType =
        payload.fileType === 'pdf-zip'
          ? 'application/zip'
          : payload.fileType === 'pdf'
            ? 'application/pdf'
            : payload.value.length > 1
              ? 'application/zip'
              : payload.fileType === 'svg'
                ? 'image/svg+xml'
                : payload.fileType === 'png'
                  ? 'image/png'
                  : 'application/octet-stream';

      await this.sendResponseMeta({
        statusCode: 200,
        headers: {
          'Content-Type': contentType,
          // 3. Filename is now based on SKU, not UPC
          'Content-Disposition': `inline; filename="${baseFilename}.${extension}"`,
        },
      });
    }

    // PDF page size in points
    const PAGE_W = payload.width ?? 93;
    const PAGE_H = payload.height ?? 71;

    const resStream =
      extension === 'zip'
        ? new ZipStream()
        : extension === 'pdf'
          ? new PDFDocument({
              size: [PAGE_W, PAGE_H],
              margin: 0,
              autoFirstPage: false,
            })
          : null;

    resStream?.on('data', (c) => {
      void this.sendResponse(c, false);
    });

    for (let i = 0; i < payload.value.length; i++) {
      const sku = payload.sku?.[i];
      const upc = payload.value[i];

      const svg = this.generateBarcodeSvg(payload.value[i], payload.type, sku);

      if (payload.fileType === 'svg') {
        if (payload.value.length === 1) {
          return this.sendResponse(svg, true);
        }

        const nameBase = sanitizeForFilename(sku || upc || `item-${i}`);

        await new Promise((r) => {
          (resStream as ZipStream).entry(
            svg,
            {
              // 3. Name per file with SKU
              name: `${nameBase}-${i}.svg`,
              type: 'file',
            },
            r,
          );
        });

        continue;
      }

      if (payload.fileType === 'png') {
        const pngBuffer = await this.svgToPNG(svg);

        if (payload.value.length === 1) {
          return this.sendResponse(pngBuffer, true);
        }

        const nameBase = sanitizeForFilename(sku || upc || `item-${i}`);

        await new Promise((r) => {
          (resStream as ZipStream).entry(
            pngBuffer,
            {
              name: `${nameBase}-${i}.png`,
              type: 'file',
            },
            r,
          );
        });

        continue;
      }

      // PDF
      if (payload.fileType === 'pdf-zip') {
        await new Promise((resolve, reject) => {
          // multiple PDFs in ZIP
          const doc = new PDFDocument({
            size: [PAGE_W, PAGE_H],
            autoFirstPage: false,
            margin: 0,
          });

          const chunks: Buffer[] = [];

          doc.on('error', (err: Error) => reject(err));

          doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);

            const nameBase = sanitizeForFilename(sku || upc || `item-${i}`);

            (resStream as ZipStream).entry(
              pdfBuffer,
              {
                name: `${nameBase}-${i}.pdf`,
                type: 'file',
              },
              resolve,
            );
          });

          doc.on('data', (c) => chunks.push(c));

          this.renderSvgToPDFPage(svg, doc, PAGE_W, PAGE_H);
          doc.end();
        });

        continue;
      }

      // single PDF output
      this.renderSvgToPDFPage(
        svg,
        resStream as typeof PDFDocument,
        PAGE_W,
        PAGE_H,
      );
    }

    if (resStream) {
      return new Promise((resolve, reject) => {
        resStream.on('error', reject);

        resStream.on('end', () => {
          resolve(this.sendResponse(undefined, true));
        });

        if (resStream instanceof ZipStream) {
          resStream.finalize();
        } else {
          resStream.end();
        }
      });
    }
  }
}
