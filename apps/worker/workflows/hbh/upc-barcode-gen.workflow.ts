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
  private readonly schema = z.object({
    // sku could be comma separated list of SKUs
    sku: z
      .string()
      .optional()
      .transform((val) => {
        val = val?.trim();

        if (!val) return undefined;
        return val.split(',').map((s) => s.trim());
      }),
    upc: z.string().transform((val) => {
      val = val.trim();
      if (!val) return [];

      return val.split(',').map((s) => s.trim());
    }),
    fileType: z.enum(['pdf-zip', 'pdf', 'svg', 'png']).default('pdf'),
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
    // @ts-ignore
    ctx.imageSmoothingEnabled = false;
    // @ts-ignore
    ctx.patternQuality = 'fast';

    const img = await loadImage(
      'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
    );

    // Render the SVG directly at the target pixel size
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas.toBuffer('image/png');
  }

  private generateBarcodeSvg(upc: string, sku?: string): string {
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

    // Top margin: large enough for the *max* possible SKU font size
    const MAX_FONT = 24;
    const SKU_TOP_PADDING = 10;
    const marginTop = sku ? MAX_FONT + SKU_TOP_PADDING + 10 : 10;

    JsBarcode(svgNode, upc, {
      xmlDocument: document,
      format: 'UPC',
      background: '#FFFFFF',
      lineColor: '#000000',
      fontSize: 18,
      height: 128,
      width: 2,
      margin: 10,
      marginTop,
      textMargin: -2,
      displayValue: true,
      font: 'Helvetica, Arial, sans-serif',
      fontOptions: '',
      textAlign: 'center',
    });

    svgNode.setAttribute('style', 'shape-rendering:crispEdges');

    if (sku) {
      const skuText = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'text',
      );

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

      const SIDE_MARGIN = 10;
      const maxTextWidth = Math.max(10, availableWidth - SIDE_MARGIN * 2);
      const CHAR_WIDTH_FACTOR = 0.58;
      const FIT_SAFETY = 0.98;
      const SPACING_ONLY_THRESHOLD = 0.94;

      const estimateWidth = (text: string, fontSize: number) =>
        text.length * fontSize * CHAR_WIDTH_FACTOR;

      let fontSize = MAX_FONT;
      while (
        fontSize > 10 &&
        estimateWidth(sku, fontSize) > maxTextWidth * FIT_SAFETY
      ) {
        fontSize -= 1;
      }

      const y = fontSize + SKU_TOP_PADDING;

      skuText.setAttribute('x', '50%');
      skuText.setAttribute('y', String(y));
      skuText.setAttribute('text-anchor', 'middle');
      skuText.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
      skuText.setAttribute('font-size', String(fontSize));
      skuText.setAttribute('fill', '#000000');
      skuText.textContent = sku;

      const est = estimateWidth(sku, fontSize);
      if (est > maxTextWidth) {
        skuText.setAttribute('textLength', String(maxTextWidth));
        skuText.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      } else if (est > maxTextWidth * SPACING_ONLY_THRESHOLD) {
        skuText.setAttribute('textLength', String(maxTextWidth));
        skuText.setAttribute('lengthAdjust', 'spacing');
      }

      svgNode.appendChild(skuText); // draw on top otherwise it'll be hidden
    }

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

    const extension =
      payload.fileType === 'pdf-zip'
        ? 'zip'
        : payload.fileType === 'pdf'
          ? 'pdf'
          : payload.upc.length > 1
            ? 'zip'
            : payload.fileType;

    if (!this.responseMetaSent) {
      const contentType =
        payload.fileType === 'pdf-zip'
          ? 'application/zip'
          : payload.fileType === 'pdf'
            ? 'application/pdf'
            : payload.upc.length > 1
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
          'Content-Disposition': `inline; filename="${payload.upc.join('__')}.${extension}"`,
        },
      });
    }

    // PDF page size in points
    const PAGE_W = 93;
    const PAGE_H = 71;

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

    for (let i = 0; i < payload.upc.length; i++) {
      const sku = payload.sku?.[i];
      const upc = payload.upc[i];

      const svg = this.generateBarcodeSvg(payload.upc[i], sku);

      if (payload.fileType === 'svg') {
        if (payload.upc.length === 1) {
          return this.sendResponse(svg, true);
        }

        await new Promise((r) => {
          (resStream as ZipStream).entry(
            svg,
            {
              name: `${upc}-${i}.svg`,
              type: 'file',
            },
            r,
          );
        });

        continue;
      }

      if (payload.fileType === 'png') {
        const pngBuffer = await this.svgToPNG(svg);

        if (payload.upc.length === 1) {
          return this.sendResponse(pngBuffer, true);
        }

        await new Promise((r) => {
          (resStream as ZipStream).entry(
            pngBuffer,
            {
              name: `${upc}-${i}.png`,
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

            (resStream as ZipStream).entry(
              pdfBuffer,
              {
                name: `${upc}-${i}.pdf`,
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
