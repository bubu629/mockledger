// src/pdf-generator.ts
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { ReconciliationEngine } from './engine.js';

function formatMoney(cents: number, currency: string): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents) / 100;
  return `${sign}${currency} $${abs.toFixed(2)}`;
}

export async function renderLocalPDFs(engine: ReconciliationEngine, outDir: string, currency: string): Promise<string[]> {
  const generatedFiles: string[] = [];

  const statementPath = path.join(outDir, 'bank_payout_statement.pdf');
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = fs.createWriteStream(statementPath);
    doc.pipe(stream);

    doc.fontSize(18).font('Helvetica-Bold').text('SYNTHETIC COMMERCIAL BANK — MERCHANT STATEMENT', { align: 'left' });
    doc.fontSize(10).font('Helvetica').fillColor('#475569')
      .text(`Settlement Currency: ${currency} | Account: CA-MERCHANT-884920 | Generated Locally by DataForge`)
      .moveDown(1);

    const totalGross = engine.payouts.reduce((s, p) => s + p.gross_total_cents, 0);
    const totalFee = engine.payouts.reduce((s, p) => s + p.fee_total_cents, 0);
    const totalNet = engine.payouts.reduce((s, p) => s + p.net_payout_cents, 0);

    doc.rect(40, doc.y, 515, 55).fillAndStroke('#f1f5f9', '#cbd5e1');
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold');
    const boxY = doc.y + 12;
    doc.text(`Total Gross Volume: ${formatMoney(totalGross, currency)}`, 55, boxY);
    doc.text(`Total Gateway/Dispute Fees: ${formatMoney(totalFee, currency)}`, 235, boxY);
    doc.text(`Net Bank Deposits: ${formatMoney(totalNet, currency)}`, 55, boxY + 20);
    doc.text(`Total Payout Batches: ${engine.payouts.length}`, 235, boxY + 20);
    doc.moveDown(3);

    doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('Payout Deposit Schedule (T+N Business Days)');
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica-Bold');
    const tableTop = doc.y;
    doc.text('Payout ID', 40, tableTop);
    doc.text('Deposit Date', 160, tableTop);
    doc.text('Tx Count', 250, tableTop);
    doc.text('Gross', 310, tableTop);
    doc.text('Fees', 400, tableTop);
    doc.text('Net Deposit', 475, tableTop);
    doc.moveTo(40, tableTop + 14).lineTo(555, tableTop + 14).stroke('#94a3b8');

    let rowY = tableTop + 20;
    doc.font('Helvetica').fontSize(8.5);

    for (const p of engine.payouts) {
      if (rowY > 760) {
        doc.addPage();
        rowY = 50;
      }
      doc.fillColor('#0f172a').text(p.payout_id, 40, rowY);
      doc.text(p.payout_date, 160, rowY);
      doc.text(String(p.transaction_count), 250, rowY);
      doc.text(formatMoney(p.gross_total_cents, currency), 310, rowY);
      doc.text(formatMoney(p.fee_total_cents, currency), 400, rowY);
      doc.fillColor(p.net_payout_cents < 0 ? '#dc2626' : '#15803d')
        .font('Helvetica-Bold')
        .text(formatMoney(p.net_payout_cents, currency), 475, rowY);
      doc.font('Helvetica');
      rowY += 16;
    }

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
  generatedFiles.push(statementPath);

  const invoicesPath = path.join(outDir, 'anomaly_commercial_invoices.pdf');
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 45, size: 'A4' });
    const stream = fs.createWriteStream(invoicesPath);
    doc.pipe(stream);

    const anomalyOrders = engine.orders.filter((o) => o.edge_case_tag !== 'NONE').slice(0, 15);
    anomalyOrders.forEach((ord, idx) => {
      if (idx > 0) doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#0f172a').text(`COMMERCIAL INVOICE #${ord.order_id}`);
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(`Issued: ${ord.created_at} | Customer ID: ${ord.customer_id}`);
      doc.moveDown(1);

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#b91c1c')
        .text(`[Injected Test Scenario]: ${ord.edge_case_tag}`);
      doc.moveDown(1);

      doc.fillColor('#0f172a').font('Helvetica');
      doc.text(`Order Currency: ${ord.order_currency}`);
      doc.text(`Order Subtotal: ${formatMoney(ord.subtotal_cents, ord.order_currency)}`);
      doc.text(`Gift Card Tender Applied: -${formatMoney(ord.gift_card_applied_cents, ord.order_currency)}`);
      doc.font('Helvetica-Bold').text(`Gateway Charged Amount: ${formatMoney(ord.Gateway_payable_cents, ord.order_currency)}`);
      doc.text(`Current Lifecycle Status: ${ord.order_status}`);
    });

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
  generatedFiles.push(invoicesPath);

  return generatedFiles;
}
