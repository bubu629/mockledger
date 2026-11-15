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
