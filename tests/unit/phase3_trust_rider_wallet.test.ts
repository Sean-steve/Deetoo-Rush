import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  DeliveryStatus,
  LedgerEntryDirection,
  OrderStatus,
} from "@deetoo/types";
import { ledgerRepository } from "../../apps/api/src/modules/finance/ledger.repository";
import { riderWalletService } from "../../apps/api/src/modules/finance/rider-wallet.service";
import { trustService } from "../../apps/api/src/modules/trust/trust.service";
import { cancellationPolicyService } from "../../apps/api/src/modules/trust/cancellation-policy.service";
import { riderPerformanceService } from "../../apps/api/src/modules/trust/rider-performance.service";
import { orderRepository } from "../../apps/api/src/modules/order/order.repository";
import { deliveryRepository } from "../../apps/api/src/modules/order/delivery.repository";
import { operationsRepository } from "../../apps/api/src/modules/operations/operations.repository";

function customerActor(customerId: string) {
  return {
    id: customerId,
    name: "Phase 3 Customer",
    roles: ["customer"],
    isStaff: false,
    merchant_ids: [],
  };
}

async function seedOrderDelivery(input?: {
  orderStatus?: OrderStatus;
  deliveryStatus?: DeliveryStatus;
}) {
  orderRepository.clearInMemory();
  deliveryRepository.clearInMemory();
  operationsRepository.clearInMemory();
  trustService.clearInMemory();
  cancellationPolicyService.clearInMemory();
  riderPerformanceService.clearInMemory();

  const customerId = randomUUID();
  const merchantId = randomUUID();
  const branchId = randomUUID();
  const orderId = randomUUID();
  const riderId = randomUUID();
  const deliveryId = randomUUID();
  const now = new Date().toISOString();

  await orderRepository.createOrder({
    id: orderId,
    public_code: `D2-${Math.floor(Math.random() * 100000)}`,
    order_number: `D2-${Math.floor(Math.random() * 100000)}`,
    checkout_quote_id: randomUUID(),
    customer_id: customerId,
    branch_id: branchId,
    merchant_id: merchantId,
    status: input?.orderStatus || OrderStatus.ACCEPTED,
    currency: "KES",
    subtotal_minor: 100000,
    delivery_fee_minor: 10000,
    service_fee_minor: 5000,
    discount_minor: 0,
    total_minor: 115000,
    customer_name: "Phase 3 Customer",
    branch_name: "Phase 3 Kitchen",
    merchant_name: "Phase 3 Merchant",
    delivery_address_snapshot: { address_text: "Test address" },
    pricing_snapshot: {},
    promotion_snapshot: null,
    special_instructions: null,
    placed_at: now,
    created_at: now,
    updated_at: now,
    items: [],
    timeline: [],
  });

  await deliveryRepository.createDelivery({
    id: deliveryId,
    order_id: orderId,
    order_number: `D2-TEST`,
    status: input?.deliveryStatus || DeliveryStatus.ASSIGNED,
    assigned_rider_id: riderId,
    branch_id: branchId,
    customer_id: customerId,
    pickup_location: { latitude: -1.28, longitude: 36.82 },
    dropoff_location: { latitude: -1.29, longitude: 36.81 },
    pickup_address_text: "Phase 3 Kitchen",
    dropoff_address_text: "Test address",
  });

  return { customerId, merchantId, branchId, orderId, riderId, deliveryId };
}

test("Phase 3 Trust: Rider cash events reconcile to balanced immutable ledger entries", async () => {
  ledgerRepository.clearInMemory();
  riderWalletService.clearInMemory();

  const riderId = randomUUID();
  const deliveryId = randomUUID();
  const orderId = randomUUID();

  const collected = await riderWalletService.recordCashCollected({
    riderId,
    deliveryId,
    orderId,
    amountMinor: 10000,
    actorUserId: randomUUID(),
  });
  assert.ok(collected.ledger_transaction_id);

  let wallet = await riderWalletService.getWallet(riderId);
  assert.equal(wallet.cash_collected_minor, 10000);
  assert.equal(wallet.cash_owed_minor, 10000);
  assert.equal(wallet.ledger_reconciled, true);
  assert.equal(wallet.reconciliation_difference_minor, 0);

  const settlement = await riderWalletService.requestCashSettlement(
    riderId,
    randomUUID(),
    4000,
  );
  await riderWalletService.confirmCashSettlement(
    settlement.id,
    randomUUID(),
    "MPESA-CASH-SETTLEMENT-1",
  );

  wallet = await riderWalletService.getWallet(riderId);
  assert.equal(wallet.cash_settled_minor, 4000);
  assert.equal(wallet.cash_owed_minor, 6000);
  assert.equal(wallet.ledger_reconciled, true);

  const transactions = await ledgerRepository.listTransactions();
  const cashTransactions = transactions.filter((tx) =>
    ["RIDER_CASH_COLLECTED", "RIDER_CASH_SETTLED"].includes(String(tx.transaction_type)),
  );
  assert.equal(cashTransactions.length, 2);

  for (const transaction of cashTransactions) {
    const entries = await ledgerRepository.findEntriesByTransactionId(transaction.id);
    const debits = entries
      .filter((entry) => entry.direction === LedgerEntryDirection.DEBIT)
      .reduce((sum, entry) => sum + entry.amount_minor, 0);
    const credits = entries
      .filter((entry) => entry.direction === LedgerEntryDirection.CREDIT)
      .reduce((sum, entry) => sum + entry.amount_minor, 0);
    assert.equal(debits, credits);
  }
});

test("Phase 3 Trust: extra-payment allegation creates a conduct case but enforcement stays human-reviewed", async () => {
  const ids = await seedOrderDelivery();

  const result = await trustService.reportExtraPaymentRequest(
    customerActor(ids.customerId),
    {
      order_id: ids.orderId,
      requested_amount_minor: 25000,
      description: "The Rider asked me to pay an extra KES 250.",
    },
  );

  assert.equal(result.trust_case.kind, "CONDUCT");
  assert.equal(result.conduct_report.rider_id, ids.riderId);
  assert.equal(result.conduct_report.authoritative_amount_minor, 115000);
  assert.ok(result.support_case.id);

  const risks = await operationsRepository.findRiskSignals({ limit: 100 });
  assert.ok(
    risks.signals.some(
      (signal: any) =>
        signal.signal_type === "RIDER_EXTRA_PAYMENT_REQUEST" &&
        signal.rider_id === ids.riderId,
    ),
  );

  const review = await trustService.reviewConduct(
    result.conduct_report.id,
    {
      id: randomUUID(),
      name: "Trust reviewer",
      roles: ["ops"],
      isStaff: true,
      merchant_ids: [],
    },
    "SUBSTANTIATED",
    "Evidence verified by Support.",
  );
  assert.equal(review.enforcement_recommendation, "WARNING_RECOMMENDED");
  assert.equal(review.human_review_required, true);
});

test("Phase 3 Trust: cancellation after fulfilment starts opens Support review instead of auto-moving money", async () => {
  const ids = await seedOrderDelivery({
    orderStatus: OrderStatus.PREPARING,
    deliveryStatus: DeliveryStatus.ASSIGNED,
  });

  const assessment = await cancellationPolicyService.assessCustomerCancellation(
    customerActor(ids.customerId),
    ids.orderId,
    "CUSTOMER_CANCELLED",
    "Customer requested cancellation after preparation began.",
  );

  assert.equal(assessment.stage, "RIDER_ASSIGNED");
  assert.equal(assessment.outcome, "SUPPORT_REVIEW");
  assert.equal(assessment.customer_refund_minor, null);
  assert.equal(assessment.merchant_compensation_minor, null);
  assert.equal(assessment.rider_compensation_minor, null);
  assert.ok(assessment.support_case_id);

  const dispute = await trustService.getDispute(
    assessment.support_case_id!,
    customerActor(ids.customerId),
  );
  assert.equal(dispute.trust_case.allegation_code, "CANCELLATION_REQUEST");
  assert.equal(dispute.conversation.case.id, assessment.support_case_id);
});

test("Phase 3 Trust: verified delivery ratings feed explainable metrics without automatic suspension", async () => {
  const ids = await seedOrderDelivery({
    orderStatus: OrderStatus.COMPLETED,
    deliveryStatus: DeliveryStatus.DELIVERED,
  });

  const rating = await riderPerformanceService.rateDelivery(
    ids.customerId,
    ids.orderId,
    2,
    "Delivery was late.",
  );
  assert.equal(rating.rating, 2);

  const metrics = await riderPerformanceService.getMetrics(ids.riderId);
  assert.equal(metrics.customer_rating, 2);
  assert.equal(metrics.customer_rating_count, 1);
  assert.equal(metrics.enforcement.automatic_suspension, false);
  assert.equal(metrics.enforcement.requires_human_review, true);
  assert.equal(metrics.delivery_punctuality_rate, null);
  assert.equal(metrics.gps_reliability_rate, null);
});
