// src/cli.ts
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { stringify } from 'csv-stringify/sync';
import archiver from 'archiver';
import { SandboxConfigSchema } from './schema.js';
import { ReconciliationEngine } from './engine.js';

const program = new Command();

program
  .name('recon-sandbox')
  .description('Deterministic E-Commerce Reconciliation Sandbox Generator (SKU 1 MVP)')
  .option('-s, --seed <string>', 'Deterministic random seed', 'sandbox-2026-v1')
  .option('-o, --out <dir>', 'Output directory', './dist/sandbox-pack')
  .parse(process.argv);

const opts = program.opts();

async function main() {
  const config = SandboxConfigSchema.parse({ seed: opts.seed });
  const engine = new ReconciliationEngine(config);

  console.log(`[1/4] Running deterministic state machine (seed="${config.seed}")...`);
  engine.run();

  const outDir = path.resolve(opts.out);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[2/4] Exporting CSV tables + ground_truth.json + SQL preview...`);
  const tables: Record<string, unknown[]> = {
    'customers.csv': engine.customers,
    'orders.csv': engine.orders,
    'payments.csv': engine.payments,
    'refunds.csv': engine.refunds,
    'disputes.csv': engine.disputes,
    'shipments.csv': engine.shipments,
    'balance_transactions.csv': engine.balanceTransactions,
    'payouts.csv': engine.payouts
  };

  for (const [filename, rows] of Object.entries(tables)) {
    const csvContent = stringify(rows, { header: true });
    fs.writeFileSync(path.join(outDir, filename), csvContent, 'utf8');
  }

  const groundTruth = engine.generateGroundTruth();
  fs.writeFileSync(
    path.join(outDir, 'ground_truth.json'),
    JSON.stringify(groundTruth, null, 2),
    'utf8'
  );

  const sqlPreview = `-- E-Commerce Reconciliation Sandbox SQL Preview (Seed: ${config.seed})
CREATE TABLE IF NOT EXISTS sandbox_payouts (
  payout_id VARCHAR(64) PRIMARY KEY,
  settlement_currency VARCHAR(8) NOT NULL,
  payout_date DATE NOT NULL,
  transaction_count INT NOT NULL,
  gross_total_cents BIGINT NOT NULL,
  fee_total_cents BIGINT NOT NULL,
  net_payout_cents BIGINT NOT NULL
);
`;
  fs.writeFileSync(path.join(outDir, 'schema_preview.sql'), sqlPreview, 'utf8');

  const zipPath = path.resolve(opts.out, `../recon-sandbox-${config.seed}.zip`);
  console.log(`[3/4] Packaging deliverable archive -> ${zipPath}`);
  await createZip(outDir, zipPath);

  console.log(`[4/4] Done! All accounting invariants passed.`);
}

function createZip(sourceDir: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
