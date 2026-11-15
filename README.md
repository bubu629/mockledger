# DataForge Studio — Local Business Process & Reconciliation Data Factory

100% Local-First deterministic synthetic business data generator for E-Commerce, Stripe Payout Reconciliation, and Chaos Edge-Case testing.

## Features
- **100% Local CPU Execution**: Zero cloud dependency, zero data leakage.
- **Penny-Exact Accounting Invariants**: Every `Order -> Payment -> Refund/Dispute -> BalanceTransaction -> Bank Payout` is mathematically reconciled in integer cents.
- **10 Pre-Planted Real-World Chaos Scenarios**: Multi-currency FX drift on refunds, uncoordinated refund + chargeback double-loss, split shipments, cross-month T+N holiday-aware settlements, and duplicate/out-of-order webhooks.
- **Offline Ed25519 License Verification**: Instant offline activation for Personal ($39) and Pro ($99) tiers, unlocking up to 50,000 orders, custom deterministic seeds, and local PDF Bank Statement rendering.

## Quick Start (Development)
```bash
npm install
npm run dev
```

## Build Standalone Binaries (Windows `.exe`, macOS, Linux)
```bash
npm run build:all
```
Or push a git tag (`git tag v1.0.0 && git push origin v1.0.0`) to let the included **GitHub Actions workflow** automatically compile and attach the Windows/macOS/Linux binaries to your **GitHub Releases** page!


### 💻 100% Local CPU Execution · Zero Cloud Upload · Penny-Exact Accounting
Stop testing your financial workflows, ERP, and Stripe webhooks with broken random Faker data. **DataForge Studio** runs 100% locally on your machine (Windows / macOS / Linux) and generates mathematically reconciled, multi-currency business datasets with pre-planted real-world accounting anomalies.

- ** Free Binary Download (GitHub Releases):** `https://github.com/bubu629/mockledger/releases`
- **🔑 Instant Offline Activation:** Powered by Ed25519 cryptographic signatures. Paste your `DF1.xxx` license key into the local Web GUI (`http://127.0.0.1:4567`) to unlock permanently—no internet connection required.

#### What's Generated in Seconds:
1. **8 Reconciled Relational Tables (CSV & SQL Preview):** `customers`, `orders`, `payments`, `refunds`, `disputes`, `shipments`, `balance_transactions`, and holiday-aware `payouts`.
2. **10 Pre-Planted Financial Chaos Scenarios:** Multi-currency FX rate drift on refunds, uncoordinated refund + chargeback double-loss, split shipments, cross-month T+N settlements, and duplicate/out-of-order webhook flags.
3. **Realistic PDF Bank Statements & Commercial Invoices (Paid Tiers):** Automatically renders multi-page Merchant Bank Statements (`bank_payout_statement.pdf`) and anomaly invoices (`anomaly_commercial_invoices.pdf`) for testing Document AI / OCR pipelines.
4. **Automated Ground Truth Answer Key (`ground_truth.json`):** Exact penny-level reconciliation summary and injected anomaly order IDs.

#### Tier Comparison:
- **Community (Free):** Up to 50 orders, locked seed, CSV export only.
- **Personal License ($39):** Up to **1,000 orders** per run + **Local PDF Bank Statement & Invoice Rendering**.
- **Pro License ($99):** Up to **50,000 orders** per run + **Custom Deterministic Seeds** + **Full Ground Truth Anomaly ID Mapping** + All future scenario packs (`b2b-procure`, `webhook-chaos`).
