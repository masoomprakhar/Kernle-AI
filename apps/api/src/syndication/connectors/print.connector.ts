import { ConnectorResult } from './generic-webhook.connector';

/** Generate a simple PDF catalog page for a product via pdfkit. */
export async function pushPrintCatalog(
  products: Array<{ sku: string; values: Record<string, any> }>,
): Promise<ConnectorResult & { pdfBase64?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const done = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(20).text('Kernle Catalog Export', { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(`Generated ${new Date().toISOString()}`);
    doc.moveDown();

    const pick = (values: Record<string, any>, code: string) => {
      const v = values?.[code];
      if (v === undefined || v === null) return '';
      if (typeof v !== 'object') return String(v);
      const ch = v['<all_channels>'] || Object.values(v)[0];
      if (typeof ch !== 'object' || ch === null) return String(ch ?? '');
      return String(ch['<all_locales>'] ?? Object.values(ch)[0] ?? '');
    };

    for (const p of products.slice(0, 50)) {
      doc.fontSize(14).text(pick(p.values, 'name') || p.sku);
      doc.fontSize(10).text(`SKU: ${p.sku}`);
      const desc = pick(p.values, 'description');
      if (desc) doc.text(desc.slice(0, 400));
      doc.moveDown();
    }

    doc.end();
    const buf = await done;
    return {
      success: true,
      responsePayload: { pageCount: Math.min(products.length, 50), bytes: buf.length },
      pdfBase64: buf.toString('base64'),
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
