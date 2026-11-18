// src/main.ts
import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { stringify } from 'csv-stringify/sync';
import { SandboxConfigSchema } from './schema.js';
import { ReconciliationEngine } from './engine.js';
import { renderLocalPDFs } from './pdf-generator.js';
import {
  LicensePayload,
  saveAndActivateLicense,
  loadSavedLicense
} from './license.js';

const app = Fastify({ logger: false });

const COMMUNITY_DEFAULT: LicensePayload = {
  license_id: 'community-free',
  tier: 'COMMUNITY',
  max_orders: 50,
  allow_custom_seed: false,
  unlocked_scenarios: ['ecom-stripe-recon'],
  issued_at: new Date().toISOString(),
  expires_at: null
};

let activeLicense: LicensePayload = loadSavedLicense() || COMMUNITY_DEFAULT;

function openBrowser(url: string) {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}

app.get('/api/license/status', async () => ({
  ok: true,
  license: activeLicense
}));

app.post('/api/license/activate', async (req, reply) => {
  const { license_key } = req.body as { license_key: string };
  const res = saveAndActivateLicense(license_key);
  if (!res.valid || !res.payload) {
    return reply.status(400).send({ ok: false, error: res.reason });
  }
  activeLicense = res.payload;
  return { ok: true, license: activeLicense };
});

app.post('/api/generate', async (req, reply) => {
  const body = req.body as Record<string, unknown>;
  const requestedOrders = Number(body.order_count || 50);
  const includePdf = Boolean(body.include_pdf);

  if (requestedOrders > activeLicense.max_orders) {
    return reply.status(403).send({
      ok: false,
      error: `[${activeLicense.tier} Limit] Max orders is ${activeLicense.max_orders}. Activate a Personal ($39) or Pro ($99) key to unlock.`
    });
  }

  if (includePdf && activeLicense.tier === 'COMMUNITY') {
    return reply.status(403).send({
      ok: false,
      error: '[Locked Feature] Local PDF Bank Statement & Invoice rendering requires a Personal ($39) or Pro ($99) license.'
    });
  }

  const effectiveSeed = activeLicense.allow_custom_seed
    ? String(body.seed || 'sandbox-2026-v1')
    : 'community-locked-seed';

  const config = SandboxConfigSchema.parse({
    seed: effectiveSeed,
    settlement_currency: body.settlement_currency || 'CAD',
    days: Number(body.days || 90),
    customer_count: Number(body.customer_count || 100),
    order_count: requestedOrders
  });

  const engine = new ReconciliationEngine(config);
  engine.run();

  const outDir = path.resolve(process.cwd(), 'DataForge_Output', config.seed);
  fs.mkdirSync(outDir, { recursive: true });

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

  for (const [name, rows] of Object.entries(tables)) {
    fs.writeFileSync(path.join(outDir, name), stringify(rows, { header: true }), 'utf8');
  }

  let pdfFiles: string[] = [];
  if (includePdf) {
    pdfFiles = await renderLocalPDFs(engine, outDir, config.settlement_currency);
  }

  const truth = engine.generateGroundTruth();
  const exportedTruth =
    activeLicense.tier === 'COMMUNITY'
      ? { metadata: truth.metadata, reconciliation_summary: truth.reconciliation_summary }
      : truth;

  fs.writeFileSync(path.join(outDir, 'ground_truth.json'), JSON.stringify(exportedTruth, null, 2));

  return {
    ok: true,
    output_dir: outDir,
    pdf_generated: pdfFiles.map((f) => path.basename(f)),
    summary: truth.reconciliation_summary
  };
});

app.get('/', async (_req, reply) => {
  reply.type('text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>DataForge — Local Business Data Factory</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 960px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; padding-bottom: 16px; }
    .badge { background: #1e293b; border: 1px solid #38bdf8; color: #38bdf8; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 20px; }
    label { display: block; font-size: 13px; color: #94a3b8; margin-top: 12px; }
    input, select { width: 100%; padding: 8px; margin-top: 4px; background: #0f172a; border: 1px solid #475569; color: #fff; border-radius: 4px; box-sizing: border-box; }
    .checkbox-row { display: flex; align-items: center; gap: 8px; margin-top: 14px; color: #fcd34d; font-size: 13px; }
    .checkbox-row input { width: auto; margin: 0; }
    button { background: #2563eb; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; margin-top: 16px; width: 100%; }
    pre { background: #020617; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; color: #38bdf8; min-height: 140px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin:0;">DataForge <span style="font-weight:normal;font-size:14px;color:#94a3b8;">100% LOCAL CPU ENGINE</span></h2>
      <div id="tierBadge" class="badge">Loading...</div>
    </div>
    <div class="grid">
      <div class="card">
        <h3 style="margin-top:0;">1. Scenario & Scale</h3>
        <label>Customer Count</label>
        <input type="number" id="customers" value="100" />
        <label>Order Count (Community: 50 | Personal: 1,000 | Pro: 50,000)</label>
        <input type="number" id="orders" value="50" />
        <label>Settlement Currency</label>
        <select id="currency"><option value="CAD">CAD</option><option value="USD">USD</option></select>
        <label>Deterministic Seed (Pro Only)</label>
        <input type="text" id="seed" value="sandbox-2026-v1" />
        <div class="checkbox-row">
          <input type="checkbox" id="includePdf" />
          <span>Render Bank Statement & Anomaly Invoices PDF (Paid License Only)</span>
        </div>
        <button onclick="generateData()">Run Local Engine & Export</button>
      </div>
      <div class="card">
        <h3 style="margin-top:0;">2. Offline License Key</h3>
        <label>Paste DF1.xxx License Key (Saved permanently to ~/.dataforge)</label>
        <input type="text" id="licenseKey" placeholder="DF1.eyJsaWNlbnNlX2lk..." />
        <button style="background:#059669;" onclick="activateLicense()">Verify & Save Offline License</button> <a href="https://t.me/Userstudiobot/Store" target="_blank" style="display:inline-block;margin-left:8px;padding:8px 14px;background:#2481cc;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px;">Buy License Key ↗</a>
        <h3 style="margin-top:20px;">3. Local Execution Output</h3>
        <pre id="outputLog">Ready.</pre>
      </div>
    </div>
  </div>
  <script>
    async function loadStatus() {
      const res = await fetch('/api/license/status');
      const data = await res.json();
      updateBadge(data.license);
    }
    function updateBadge(lic) {
      document.getElementById('tierBadge').innerText = 'Tier: ' + lic.tier + ' (Max ' + lic.max_orders + ' Orders)';
      if (lic.tier !== 'COMMUNITY') {
        document.getElementById('orders').value = 300;
        document.getElementById('includePdf').checked = true;
      }
    }
    async function activateLicense() {
      const key = document.getElementById('licenseKey').value;
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: key })
      });
      const data = await res.json();
      if (!data.ok) return alert(data.error);
      updateBadge(data.license);
      document.getElementById('outputLog').innerText = '✅ License verified via Ed25519 and saved to ~/.dataforge/license.key!';
    }
    async function generateData() {
      document.getElementById('outputLog').innerText = '⏳ Generating on local CPU...';
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_count: document.getElementById('customers').value,
          order_count: document.getElementById('orders').value,
          settlement_currency: document.getElementById('currency').value,
          seed: document.getElementById('seed').value,
          include_pdf: document.getElementById('includePdf').checked
        })
      });
      const data = await res.json();
      if (!data.ok) {
        document.getElementById('outputLog').innerText = '❌ ' + data.error;
        return;
      }
      document.getElementById('outputLog').innerText =
        '✅ Exported to: ' + data.output_dir +
        '\n📄 PDFs: ' + (data.pdf_generated.join(', ') || 'None') +
        '\n\n' + JSON.stringify(data.summary, null, 2);
    }
    loadStatus();
  </script>
</body>
</html>`);
});

const PORT = 4567;
app.listen({ port: PORT, host: '127.0.0.1' }).then(() => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`🚀 DataForge Local Engine started at ${url}`);
  openBrowser(url);
});
