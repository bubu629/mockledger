// tests/reconciliation.test.ts
import { describe, it, expect } from 'vitest';
import { SandboxConfigSchema } from '../src/schema.js';
import { ReconciliationEngine } from '../src/engine.js';

describe('SKU 1: E-Commerce Reconciliation Sandbox MVP', () => {
  it('generates deterministic, penny-exact reconciled datasets with all 10 edge cases', () => {
    const cfg = SandboxConfigSchema.parse({ seed: 'unit-test-seed-01' });
    const engine1 = new ReconciliationEngine(cfg);
    engine1.run();

    const engine2 = new ReconciliationEngine(cfg);
    engine2.run();

    expect(engine1.payouts).toEqual(engine2.payouts);
    expect(engine1.customers.length).toBe(100);
    expect(engine1.orders.length).toBe(300);

    const truth = engine1.generateGroundTruth();
    const injectedTypes = Object.keys(truth.injected_edge_cases_by_type);
    expect(injectedTypes.length).toBe(10);
    for (const type of injectedTypes) {
      expect(truth.injected_edge_cases_by_type[type].length).toBe(5);
    }

    const sumFromBt = engine1.balanceTransactions.reduce((s, b) => s + b.net_cents, 0);
    const sumFromPayouts = engine1.payouts.reduce((s, p) => s + p.net_payout_cents, 0);
    expect(sumFromBt).toBe(sumFromPayouts);
  });
});
