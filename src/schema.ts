// src/schema.ts
import { z } from 'zod';

export const SandboxConfigSchema = z.object({
  seed: z.string().default('sandbox-2026-v1'),
  settlement_currency: z.enum(['CAD', 'USD']).default('CAD'),
  start_date: z.string().default('2026-01-01T00:00:00Z'),
  days: z.number().int().min(30).max(365).default(90),
  customer_count: z.number().int().default(100),
  order_count: z.number().int().default(300),
  settlement_delay_business_days: z.number().int().min(1).max(7).default(2),
  dispute_fee_cents: z.number().int().default(1500),
  stripe_pct_fee_bps: z.number().int().default(290),
  stripe_fixed_fee_cents: z.number().int().default(30),
  fx_spread_bps: z.number().int().default(200),
  holidays: z.array(z.string()).default([
    '2026-01-01',
    '2026-02-16',
    '2026-04-03'
  ])
});

export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

export type EdgeCaseType =
  | 'NONE'
  | 'FX_RATE_DRIFT_ON_REFUND'
  | 'PARTIAL_REFUND_MULTI'
  | 'CROSS_MONTH_SETTLEMENT'
  | 'DUPLICATE_WEBHOOK_DELIVERY'
  | 'OUT_OF_ORDER_WEBHOOK'
  | 'PAYMENT_FAIL_THEN_RETRY'
  | 'DISPUTE_COLLIDES_WITH_REFUND'
  | 'SPLIT_SHIPMENT_DELIVERY'
  | 'GIFT_CARD_MIXED_TENDER'
  | 'FEE_ROUNDING_BOUNDARY';

export interface CustomerRow {
  customer_id: string;
  email: string;
  country: string;
  preferred_currency: 'CAD' | 'USD' | 'EUR';
  created_at: string;
}

export interface OrderRow {
  order_id: string;
  customer_id: string;
  order_currency: 'CAD' | 'USD' | 'EUR';
  subtotal_cents: number;
  gift_card_applied_cents: number;
  Gateway_payable_cents: number;
  order_status: 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'DISPUTED';
  edge_case_tag: EdgeCaseType;
  created_at: string;
}

export interface PaymentRow {
  payment_id: string;
  order_id: string;
  attempt_number: number;
  status: 'FAILED' | 'SUCCEEDED';
  currency: 'CAD' | 'USD' | 'EUR';
  amount_cents: number;
  fx_rate_to_settlement: number;
  webhook_delivery_count: number;
  webhook_sequence_anomaly: boolean;
  created_at: string;
}

export interface RefundRow {
  refund_id: string;
  payment_id: string;
  order_id: string;
  currency: 'CAD' | 'USD' | 'EUR';
  refund_amount_cents: number;
  fx_rate_at_refund: number;
  settlement_impact_cents: number;
  reason: string;
  created_at: string;
}

export interface DisputeRow {
  dispute_id: string;
  payment_id: string;
  order_id: string;
  status: 'LOST' | 'WON';
  disputed_amount_settlement_cents: number;
  dispute_fee_settlement_cents: number;
  overlapped_with_refund: boolean;
  created_at: string;
}

export interface ShipmentRow {
  shipment_id: string;
  order_id: string;
  package_index: number;
  total_packages: number;
  carrier: string;
  tracking_status: 'DELIVERED' | 'IN_TRANSIT' | 'SPLIT_DELAYED';
  shipped_at: string;
}

export interface BalanceTransactionRow {
  bt_id: string;
  source_type: 'CHARGE' | 'REFUND' | 'DISPUTE_DEBIT' | 'DISPUTE_FEE';
  source_id: string;
  order_id: string;
  settlement_currency: string;
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
  available_on_date: string;
  payout_id: string;
  created_at: string;
}

export interface PayoutRow {
  payout_id: string;
  settlement_currency: string;
  payout_date: string;
  transaction_count: number;
  gross_total_cents: number;
  fee_total_cents: number;
  net_payout_cents: number;
}
