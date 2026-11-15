// src/engine.ts
import { SeededPRNG } from './prng.js';
import {
  SandboxConfig,
  EdgeCaseType,
  CustomerRow,
  OrderRow,
  PaymentRow,
  RefundRow,
  DisputeRow,
  ShipmentRow,
  BalanceTransactionRow,
  PayoutRow
} from './schema.js';

export class ReconciliationEngine {
  private rng: SeededPRNG;
  private config: SandboxConfig;

  public customers: CustomerRow[] = [];
  public orders: OrderRow[] = [];
  public payments: PaymentRow[] = [];
  public refunds: RefundRow[] = [];
  public disputes: DisputeRow[] = [];
  public shipments: ShipmentRow[] = [];
  public balanceTransactions: BalanceTransactionRow[] = [];
  public payouts: PayoutRow[] = [];

  constructor(config: SandboxConfig) {
    this.config = config;
    this.rng = new SeededPRNG(config.seed);
  }

  private computeSettlementDate(isoTimestamp: string, extraDelayDays = 0): string {
    const d = new Date(isoTimestamp);
    let remaining = this.config.settlement_delay_business_days + extraDelayDays;
    while (remaining > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      const dayOfWeek = d.getUTCDay();
      const ymd = d.toISOString().slice(0, 10);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = this.config.holidays.includes(ymd);
      if (!isWeekend && !isHoliday) {
        remaining--;
      }
    }
    return d.toISOString().slice(0, 10);
  }

  public run() {
    this.generateCustomers();
    this.generateOrdersAndLifecycle();
    this.aggregatePayouts();
    this.verifyAccountingInvariants();
  }

  private generateCustomers() {
    const countries = [
      { country: 'CA', currency: 'CAD' as const },
      { country: 'US', currency: 'USD' as const },
      { country: 'DE', currency: 'EUR' as const }
    ];
    const startMs = new Date(this.config.start_date).getTime();

    for (let i = 1; i <= this.config.customer_count; i++) {
      const c = this.rng.pick(countries);
      const createdMs = startMs + this.rng.int(0, 5 * 86400_000);
      this.customers.push({
        customer_id: this.rng.id('cus', i),
        email: `buyer_${i}@synthetic-corp.test`,
        country: c.country,
        preferred_currency: c.currency,
        created_at: new Date(createdMs).toISOString()
      });
    }
  }

  private assignEdgeCase(orderIndex: number): EdgeCaseType {
    const cases: EdgeCaseType[] = [
      'FX_RATE_DRIFT_ON_REFUND',
      'PARTIAL_REFUND_MULTI',
      'CROSS_MONTH_SETTLEMENT',
      'DUPLICATE_WEBHOOK_DELIVERY',
      'OUT_OF_ORDER_WEBHOOK',
      'PAYMENT_FAIL_THEN_RETRY',
      'DISPUTE_COLLIDES_WITH_REFUND',
      'SPLIT_SHIPMENT_DELIVERY',
      'GIFT_CARD_MIXED_TENDER',
      'FEE_ROUNDING_BOUNDARY'
    ];
    if (orderIndex <= 50) {
      return cases[(orderIndex - 1) % cases.length];
    }
    return 'NONE';
  }

  private generateOrdersAndLifecycle() {
    const startMs = new Date(this.config.start_date).getTime();
    let paymentSeq = 1;
    let refundSeq = 1;
    let disputeSeq = 1;
    let shipmentSeq = 1;
    let btSeq = 1;

    for (let i = 1; i <= this.config.order_count; i++) {
      const customer = this.rng.pick(this.customers);
      const edgeCase = this.assignEdgeCase(i);

      let orderCreatedMs = startMs + this.rng.int(1, this.config.days - 5) * 86400_000 + this.rng.int(0, 80000_000);
      if (edgeCase === 'CROSS_MONTH_SETTLEMENT') {
        orderCreatedMs = new Date('2026-01-31T23:30:00Z').getTime() + this.rng.int(0, 1200_000);
      }
      const orderCreatedAt = new Date(orderCreatedMs).toISOString();

      const currency = edgeCase === 'FX_RATE_DRIFT_ON_REFUND' ? 'USD' : customer.preferred_currency;
      const baseFx = currency === 'CAD' ? 1.0 : currency === 'USD' ? 1.36 : 1.48;

      const subtotalCents = edgeCase === 'FEE_ROUNDING_BOUNDARY'
        ? 101
        : this.rng.int(2500, 35000);

      const giftCardCents = edgeCase === 'GIFT_CARD_MIXED_TENDER'
        ? Math.floor(subtotalCents * 0.4)
        : 0;
      const payableCents = subtotalCents - giftCardCents;

      const orderId = this.rng.id('ord', i);
      let orderStatus: OrderRow['order_status'] = 'PAID';

      if (edgeCase === 'PAYMENT_FAIL_THEN_RETRY') {
        this.payments.push({
          payment_id: this.rng.id('pay', paymentSeq++),
          order_id: orderId,
          attempt_number: 1,
          status: 'FAILED',
          currency,
          amount_cents: payableCents,
          fx_rate_to_settlement: baseFx,
          webhook_delivery_count: 1,
          webhook_sequence_anomaly: false,
          created_at: orderCreatedAt
        });
      }

      const successPayId = this.rng.id('pay', paymentSeq++);
      const payCreatedAt = edgeCase === 'PAYMENT_FAIL_THEN_RETRY'
        ? new Date(orderCreatedMs + 600_000).toISOString()
        : orderCreatedAt;

      this.payments.push({
        payment_id: successPayId,
        order_id: orderId,
        attempt_number: edgeCase === 'PAYMENT_FAIL_THEN_RETRY' ? 2 : 1,
        status: 'SUCCEEDED',
        currency,
        amount_cents: payableCents,
        fx_rate_to_settlement: baseFx,
        webhook_delivery_count: edgeCase === 'DUPLICATE_WEBHOOK_DELIVERY' ? 3 : 1,
        webhook_sequence_anomaly: edgeCase === 'OUT_OF_ORDER_WEBHOOK',
        created_at: payCreatedAt
      });

      const grossSettlementCents = Math.round(payableCents * baseFx);
      const effectiveFeeBps = this.config.stripe_pct_fee_bps + (currency !== this.config.settlement_currency ? this.config.fx_spread_bps : 0);
      const feeSettlementCents = Math.round((grossSettlementCents * effectiveFeeBps) / 10000) + this.config.stripe_fixed_fee_cents;
      const netSettlementCents = grossSettlementCents - feeSettlementCents;
      const chargeAvailableDate = this.computeSettlementDate(payCreatedAt);

      this.balanceTransactions.push({
        bt_id: this.rng.id('bt', btSeq++),
        source_type: 'CHARGE',
        source_id: successPayId,
        order_id: orderId,
        settlement_currency: this.config.settlement_currency,
        gross_cents: grossSettlementCents,
        fee_cents: feeSettlementCents,
        net_cents: netSettlementCents,
        available_on_date: chargeAvailableDate,
        payout_id: 'PENDING',
        created_at: payCreatedAt
      });

      if (edgeCase === 'FX_RATE_DRIFT_ON_REFUND') {
        const refundFx = Number((baseFx + 0.05).toFixed(4));
        const refundAt = new Date(orderCreatedMs + 5 * 86400_000).toISOString();
        const refundSettlementCents = -Math.round(payableCents * refundFx);
        const refId = this.rng.id('re', refundSeq++);

        this.refunds.push({
          refund_id: refId,
          payment_id: successPayId,
          order_id: orderId,
          currency,
          refund_amount_cents: payableCents,
          fx_rate_at_refund: refundFx,
          settlement_impact_cents: refundSettlementCents,
          reason: 'FX_DRIFT_FULL_REFUND',
          created_at: refundAt
        });

        this.balanceTransactions.push({
          bt_id: this.rng.id('bt', btSeq++),
          source_type: 'REFUND',
          source_id: refId,
          order_id: orderId,
          settlement_currency: this.config.settlement_currency,
          gross_cents: refundSettlementCents,
          fee_cents: 0,
          net_cents: refundSettlementCents,
          available_on_date: this.computeSettlementDate(refundAt),
          payout_id: 'PENDING',
          created_at: refundAt
        });
        orderStatus = 'REFUNDED';
      }

      if (edgeCase === 'PARTIAL_REFUND_MULTI') {
        const part1 = Math.floor(payableCents * 0.3);
        const part2 = Math.floor(payableCents * 0.25);
        [part1, part2].forEach((amt, idx) => {
          const refAt = new Date(orderCreatedMs + (idx + 2) * 86400_000).toISOString();
          const impact = -Math.round(amt * baseFx);
          const refId = this.rng.id('re', refundSeq++);
          this.refunds.push({
            refund_id: refId,
            payment_id: successPayId,
            order_id: orderId,
            currency,
            refund_amount_cents: amt,
            fx_rate_at_refund: baseFx,
            settlement_impact_cents: impact,
            reason: `PARTIAL_REFUND_${idx + 1}`,
            created_at: refAt
          });
          this.balanceTransactions.push({
            bt_id: this.rng.id('bt', btSeq++),
            source_type: 'REFUND',
            source_id: refId,
            order_id: orderId,
            settlement_currency: this.config.settlement_currency,
            gross_cents: impact,
            fee_cents: 0,
            net_cents: impact,
            available_on_date: this.computeSettlementDate(refAt),
            payout_id: 'PENDING',
            created_at: refAt
          });
        });
        orderStatus = 'PARTIALLY_REFUNDED';
      }

      if (edgeCase === 'DISPUTE_COLLIDES_WITH_REFUND') {
        const eventAt = new Date(orderCreatedMs + 4 * 86400_000).toISOString();
        const partialRefundAmt = Math.floor(payableCents * 0.5);
        const refundImpact = -Math.round(partialRefundAmt * baseFx);
        const refId = this.rng.id('re', refundSeq++);

        this.refunds.push({
          refund_id: refId,
          payment_id: successPayId,
          order_id: orderId,
          currency,
          refund_amount_cents: partialRefundAmt,
          fx_rate_at_refund: baseFx,
          settlement_impact_cents: refundImpact,
          reason: 'UNCOORDINATED_REFUND_DURING_DISPUTE',
          created_at: eventAt
        });

        const dispId = this.rng.id('dp', disputeSeq++);
        const disputeDebitCents = -grossSettlementCents;
        const disputeFeeCents = this.config.dispute_fee_cents;

        this.disputes.push({
          dispute_id: dispId,
          payment_id: successPayId,
          order_id: orderId,
          status: 'LOST',
          disputed_amount_settlement_cents: disputeDebitCents,
          dispute_fee_settlement_cents: -disputeFeeCents,
          overlapped_with_refund: true,
          created_at: eventAt
        });

        const availDate = this.computeSettlementDate(eventAt);
        this.balanceTransactions.push(
          {
            bt_id: this.rng.id('bt', btSeq++),
            source_type: 'REFUND',
            source_id: refId,
            order_id: orderId,
            settlement_currency: this.config.settlement_currency,
            gross_cents: refundImpact,
            fee_cents: 0,
            net_cents: refundImpact,
            available_on_date: availDate,
            payout_id: 'PENDING',
            created_at: eventAt
          },
          {
            bt_id: this.rng.id('bt', btSeq++),
            source_type: 'DISPUTE_DEBIT',
            source_id: dispId,
            order_id: orderId,
            settlement_currency: this.config.settlement_currency,
            gross_cents: disputeDebitCents,
            fee_cents: disputeFeeCents,
            net_cents: disputeDebitCents - disputeFeeCents,
            available_on_date: availDate,
            payout_id: 'PENDING',
            created_at: eventAt
          }
        );
        orderStatus = 'DISPUTED';
      }

      const pkgCount = edgeCase === 'SPLIT_SHIPMENT_DELIVERY' ? 2 : 1;
      for (let p = 1; p <= pkgCount; p++) {
        this.shipments.push({
          shipment_id: this.rng.id('shp', shipmentSeq++),
          order_id: orderId,
          package_index: p,
          total_packages: pkgCount,
          carrier: this.rng.pick(['CanadaPost', 'UPS', 'FedEx']),
          tracking_status: pkgCount > 1 && p === 2 ? 'SPLIT_DELAYED' : 'DELIVERED',
          shipped_at: new Date(orderCreatedMs + p * 43200_000).toISOString()
        });
      }

      this.orders.push({
        order_id: orderId,
        customer_id: customer.customer_id,
        order_currency: currency,
        subtotal_cents: subtotalCents,
        gift_card_applied_cents: giftCardCents,
        Gateway_payable_cents: payableCents,
        order_status: orderStatus,
        edge_case_tag: edgeCase,
        created_at: orderCreatedAt
      });
    }
  }

  private aggregatePayouts() {
    const byDate = new Map<string, BalanceTransactionRow[]>();
    for (const bt of this.balanceTransactions) {
      const list = byDate.get(bt.available_on_date) || [];
      list.push(bt);
      byDate.set(bt.available_on_date, list);
    }

    const sortedDates = Array.from(byDate.keys()).sort();
    sortedDates.forEach((dateStr, idx) => {
      const payoutId = this.rng.id('po', idx + 1);
      const txs = byDate.get(dateStr)!;
      let grossSum = 0;
      let feeSum = 0;
      let netSum = 0;

      for (const tx of txs) {
        tx.payout_id = payoutId;
        grossSum += tx.gross_cents;
        feeSum += tx.fee_cents;
        netSum += tx.net_cents;
      }

      this.payouts.push({
        payout_id: payoutId,
        settlement_currency: this.config.settlement_currency,
        payout_date: dateStr,
        transaction_count: txs.length,
        gross_total_cents: grossSum,
        fee_total_cents: feeSum,
        net_payout_cents: netSum
      });
    });
  }

  public verifyAccountingInvariants() {
    for (const bt of this.balanceTransactions) {
      if (bt.gross_cents - bt.fee_cents !== bt.net_cents) {
        throw new Error(`Accounting invariant failed on BalanceTransaction ${bt.bt_id}`);
      }
    }

    const totalBtNet = this.balanceTransactions.reduce((acc, row) => acc + row.net_cents, 0);
    const totalPayoutNet = this.payouts.reduce((acc, row) => acc + row.net_payout_cents, 0);

    if (totalBtNet !== totalPayoutNet) {
      throw new Error(`Total ledger net (${totalBtNet}) !== Total payout net (${totalPayoutNet})`);
    }
  }

  public generateGroundTruth() {
    const edgeCaseMap: Record<string, string[]> = {};
    for (const o of this.orders) {
      if (o.edge_case_tag !== 'NONE') {
        edgeCaseMap[o.edge_case_tag] = edgeCaseMap[o.edge_case_tag] || [];
        edgeCaseMap[o.edge_case_tag].push(o.order_id);
      }
    }

    return {
      metadata: {
        seed: this.config.seed,
        settlement_currency: this.config.settlement_currency,
        generated_counts: {
          customers: this.customers.length,
          orders: this.orders.length,
          payments: this.payments.length,
          refunds: this.refunds.length,
          disputes: this.disputes.length,
          shipments: this.shipments.length,
          balance_transactions: this.balanceTransactions.length,
          payouts: this.payouts.length
        }
      },
      reconciliation_summary: {
        total_gross_settlement_cents: this.payouts.reduce((s, p) => s + p.gross_total_cents, 0),
        total_fees_settlement_cents: this.payouts.reduce((s, p) => s + p.fee_total_cents, 0),
        total_net_payout_settlement_cents: this.payouts.reduce((s, p) => s + p.net_payout_cents, 0),
        double_loss_dispute_refund_orders: edgeCaseMap['DISPUTE_COLLIDES_WITH_REFUND'] || [],
        fx_drift_orders: edgeCaseMap['FX_RATE_DRIFT_ON_REFUND'] || []
      },
      injected_edge_cases_by_type: edgeCaseMap
    };
  }
}
