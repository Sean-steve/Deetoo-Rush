import { freezeFixtureEconomics, initiateFixturePayment, fixtureCallback } from '../helpers/paid-order';
import { closeTestResources } from "../helpers/marketplace";
/**
 * DEETOO - SPRINT 14 E2E CROSS-APP JOURNEY TEST
 * Validates the complete four-app lifecycle (Customer -> Merchant -> Rider -> Admin -> Ledger)
 * Requirements 70-76 & Final Gate Verification
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  OrderStatus,
  DeliveryStatus,
  PaymentStatus,
  PaymentMethod,
  PaymentProvider,
  MerchantSettlementStatus,
  RiderPayoutStatus,
} from "@deetoo/types";
import { orderRepository } from "../../apps/api/src/modules/order/order.repository";
import { orderService } from "../../apps/api/src/modules/order/order.service";
import { deliveryRepository } from "../../apps/api/src/modules/order/delivery.repository";
import { paymentRepository } from "../../apps/api/src/modules/payment/payment.repository";
import { paymentService } from "../../apps/api/src/modules/payment/payment.service";
import { financialPostingService } from "../../apps/api/src/modules/finance/financial-posting.service";
import { settlementService } from "../../apps/api/src/modules/finance/settlement.service";
import { riderEarningsService } from "../../apps/api/src/modules/finance/rider-earnings.service";
import { riderPayoutService } from "../../apps/api/src/modules/finance/rider-payout.service";
import { supportService } from "../../apps/api/src/modules/operations/support.service";
import { unifiedOrderViewService } from "../../apps/api/src/modules/operations/unified-order-view.service";
import { riderRepository } from "../../apps/api/src/modules/rider/rider.repository";

test("--- SPRINT 14: COMPLETE 4-APP CROSS-JOURNEY (CUSTOMER, MERCHANT, RIDER, ADMIN & LEDGER) ---", async () => {
  const customerId = `cust_e2e_${Date.now()}`;
  const merchantId = `m_e2e_${Date.now()}`;
  const branchId = `b_e2e_${Date.now()}`;
  const riderId = "rider_john_01";
  const staffUser = {
    id: `usr_staff_${Date.now()}`,
    email: "manager@restaurant.co.ke",
  };

  // 1. CUSTOMER JOURNEY: Create Cart, Checkout & Place Order
  const orderId = `ord_e2e_${Date.now()}`;
  const orderNumber = `DT-E2E-${Date.now().toString().slice(-4)}`;
  const order = await orderRepository.createOrder({
    id: orderId,
    public_code: orderNumber,
    order_number: orderNumber,
    checkout_quote_id: `quote_e2e_${Date.now()}`,
    customer_id: customerId,
    customer_name: "Amina Wangari",
    customer_phone: "+254712345678",
    branch_id: branchId,
    branch_name: "Mama Oliech Kilimani",
    merchant_id: merchantId,
    merchant_name: "Mama Oliech",
    status: OrderStatus.PENDING_PAYMENT,
    currency: "KES",
    subtotal_minor: 120000,
    delivery_fee_minor: 25000,
    service_fee_minor: 5000,
    discount_minor: 0,
    total_minor: 150000, // Total: KES 1,500.00
    items: [
      {
        id: `item_${Date.now()}`,
        order_id: orderId,
        menu_item_id: "menu_tilapia_ugali",
        name: "Whole Tilapia with Ugali",
        quantity: 1,
        unit_price_minor: 120000,
        subtotal_minor: 120000,
        modifiers: [],
      },
    ],
    delivery_address_snapshot: {
      recipient_name: "Amina Wangari",
      formatted_address: "Delta Corner, Westlands, Nairobi",
      location: { latitude: -1.265, longitude: 36.804 },
    },
    pricing_snapshot: {
      subtotal_minor: 120000,
      delivery_fee_minor: 25000,
      service_fee_minor: 5000,
      discount_minor: 0,
      total_minor: 150000,
      currency: "KES",
    },
    timeline: [],
    placed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
  });

  assert.ok(order.id);
  assert.equal(order.status, OrderStatus.PENDING_PAYMENT);
  await freezeFixtureEconomics(order);
  (orderRepository as any).orders.set(order.id,order);

  // 2. PAYMENT: Customer pays via M-PESA
  const payment = await initiateFixturePayment({
    orderId: order.id,
    customerId,
    method: "MPESA",
    phone: "0712345678",
    idempotencyKey: `idem_pay_e2e_${Date.now()}`,
  });

  assert.ok(payment.id);
  assert.equal(payment.status, PaymentStatus.PENDING);

  // Simulate payment captured callback
  await fixtureCallback("MPESA", {}, "", {
    Body: {
      stkCallback: {
        MerchantRequestID: payment.merchant_request_id,
        CheckoutRequestID: payment.checkout_request_id,
        ResultCode: 0,
        ResultDesc: "Success",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: payment.amount_minor / 100 },
            { Name: "MpesaReceiptNumber", Value: `REC_E2E_${Date.now()}` },
          ],
        },
      },
    },
  });

  const capturedPayment = await paymentRepository.findPaymentById(payment.id);
  assert.equal(capturedPayment?.status, PaymentStatus.CAPTURED);

  // 3. MERCHANT JOURNEY: Merchant accepts order & sets preparation time
  const acceptedOrder = await orderService.merchantAcceptOrder(
    branchId,
    staffUser,
    order.id,
    20,
  );
  assert.equal(acceptedOrder.status, OrderStatus.ACCEPTED);

  const preparingOrder = await orderService.merchantMarkPreparing(
    branchId,
    staffUser,
    order.id,
  );
  assert.equal(preparingOrder.status, OrderStatus.PREPARING);

  // 4. DISPATCH & RIDER JOURNEY: System initializes delivery
  let delivery = await deliveryRepository.findByOrderId(order.id);
  if (!delivery) {
    delivery = await deliveryRepository.createDelivery({
      id: `del_e2e_${Date.now()}`,
      order_id: order.id,
      branch_id: branchId,
      customer_id: customerId,
      status: DeliveryStatus.UNASSIGNED,
      pickup_location: { latitude: -1.2921, longitude: 36.7845 },
      dropoff_location: { latitude: -1.265, longitude: 36.804 },
      pickup_address_text: "Mama Oliech Kilimani",
      dropoff_address_text: "Delta Corner, Westlands",
      reassignment_count: 0,
      dispatch_attention_required: false,
      current_search_radius_meters: 3000,
      dispatch_cycle_count: 1,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // Rider accepts assignment
  const assignedDelivery = await deliveryRepository.updateDelivery(
    delivery.id,
    {
      status: DeliveryStatus.ASSIGNED,
      assigned_rider_id: riderId,
      assigned_at: new Date().toISOString(),
    },
  );
  assert.equal(assignedDelivery.status, DeliveryStatus.ASSIGNED);
  assert.equal(assignedDelivery.assigned_rider_id, riderId);

  // Merchant marks food READY
  const readyOrder = await orderService.merchantMarkReady(
    branchId,
    staffUser,
    order.id,
  );
  assert.equal(readyOrder.status, OrderStatus.READY);

  // Rider arrives at pickup & picks up food
  await deliveryRepository.updateDelivery(delivery.id, {
    status: DeliveryStatus.ARRIVED_PICKUP,
    arrived_pickup_at: new Date().toISOString(),
  });
  const pickedUpDelivery = await deliveryRepository.updateDelivery(
    delivery.id,
    {
      status: DeliveryStatus.PICKED_UP,
      picked_up_at: new Date().toISOString(),
    },
  );
  assert.equal(pickedUpDelivery.status, DeliveryStatus.PICKED_UP);

  // Rider arrives at customer and completes delivery
  const deliveredDelivery = await deliveryRepository.updateDelivery(
    delivery.id,
    {
      status: DeliveryStatus.DELIVERED,
      delivered_at: new Date().toISOString(),
    },
  );
  assert.equal(deliveredDelivery.status, DeliveryStatus.DELIVERED);

  // Mark order COMPLETED upon delivery
  const completedOrder = await orderRepository.updateOrderStatus(
    order.id,
    OrderStatus.COMPLETED,
    { completed_at: new Date().toISOString() },
    {
      id: `tl_${Date.now()}`,
      order_id: order.id,
      from_status: OrderStatus.READY,
      to_status: OrderStatus.COMPLETED,
      actor_type: "SYSTEM",
      actor_id: "dispatch_engine",
      actor_name: "Deetoo Dispatch",
      note: "Delivery completed successfully",
      created_at: new Date().toISOString(),
    },
  );
  assert.equal(completedOrder.status, OrderStatus.COMPLETED);

  // 5. FINANCIAL LEDGER & POSTING: Double-entry economics posted
  const financialSummary = await financialPostingService.postPaymentCapture(
    capturedPayment!,
    {
      id: order.id,
      order_number: orderNumber,
      merchant_id: merchantId,
      pricing: {
        items_subtotal_minor: 120000,
        delivery_fee_minor: 25000,
        service_fee_minor: 5000,
        discount_minor: 0,
        total_minor: 150000,
      },
    },
  );

  assert.ok(financialSummary);
  assert.equal(financialSummary.gross_platform_revenue_minor, 54000); // 24k comm + 25k delivery + 5k service
  assert.equal(financialSummary.merchant_payable_minor, 96000); // 120k food - 24k comm

  // Rider earning recorded & posted
  const earning = await riderEarningsService.calculateAndRecordEarning({
    riderId,
    deliveryId: delivery.id,
    orderId: order.id,
    distanceMeters: 4500,
  });
  assert.ok(earning);
  assert.ok(earning.total_amount_minor > 0);
  await financialPostingService.postRiderEarning(earning);

  // 6. SETTLEMENT & PAYOUTS: Calculate, approve & pay merchant and rider
  const settlement = await settlementService.calculateSettlement(merchantId);
  assert.ok(settlement);
  assert.equal(settlement.status, MerchantSettlementStatus.CALCULATED);

  const approvedSettlement = await settlementService.approveSettlement(
    settlement.id,
    "usr_fin_admin",
  );
  assert.equal(approvedSettlement.status, MerchantSettlementStatus.APPROVED);

  const paidSettlement = await settlementService.paySettlement(
    settlement.id,
    "BANK-KCB-992211",
  );
  assert.equal(paidSettlement.status, MerchantSettlementStatus.PAID);

  const payout = await riderPayoutService.calculatePayout(riderId);
  assert.ok(payout);
  assert.equal(payout.status, RiderPayoutStatus.DRAFT);

  const approvedPayout = await riderPayoutService.approvePayout(
    payout.id,
    "usr_fin_admin",
  );
  assert.equal(approvedPayout.status, RiderPayoutStatus.APPROVED);

  const paidPayout = await riderPayoutService.payPayout(
    payout.id,
    "MPESA-B2C-774411",
  );
  assert.equal(paidPayout.status, RiderPayoutStatus.PAID);

  // 7. ADMIN 360-DEGREE UNIFIED ORDER VIEW
  const unifiedView = await unifiedOrderViewService.getUnifiedOrderView(
    order.id,
  );
  assert.ok(unifiedView);
  assert.equal(unifiedView.order.id, order.id);
  assert.equal(unifiedView.order.status, OrderStatus.COMPLETED);
  assert.equal(unifiedView.delivery?.status, DeliveryStatus.DELIVERED);
  assert.ok(unifiedView.payments && unifiedView.payments.length > 0);

  // 8. SUPPORT & INCIDENTS: Create and resolve support case
  const supportCase = await supportService.createCase({
    category: "ORDER_ISSUE",
    priority: "MEDIUM" as any,
    order_id: order.id,
    customer_id: customerId,
    subject: "Customer requested electronic tax receipt",
    description: "Customer requested VAT receipt sent to email",
    creator: { id: customerId, name: "Amina Wangari", role: "customer" },
  });
  assert.ok(supportCase.id);
  assert.equal(supportCase.order_id, order.id);

  const proposedCase = await supportService.resolveCase(
    supportCase.id,
    "RESOLVED_BY_AGENT",
    "Sent electronic invoice with KRA PIN to customer email",
    { id: "usr_admin", name: "Ops Chief", roles: ["admin"], isStaff: true },
  );
  assert.equal(proposedCase.status, "PARTY_CONFIRMATION");

  const customerConfirmed = await supportService.respondToResolution(
    supportCase.id,
    {
      id: customerId,
      name: "Amina Wangari",
      roles: ["customer"],
      isStaff: false,
      merchant_ids: [],
    },
    "ACCEPTED",
    "The electronic invoice resolves my request.",
  );
  assert.equal(customerConfirmed.status, "PARTY_CONFIRMATION");

  const resolvedCase = await supportService.respondToResolution(
    supportCase.id,
    {
      id: "merchant_owner_phase14",
      name: "Merchant Owner",
      roles: ["merchant_owner"],
      isStaff: false,
      merchant_ids: [merchantId],
    },
    "ACCEPTED",
    "We confirm the invoice was supplied.",
  );
  assert.equal(resolvedCase.status, "CLOSED");
});

after(closeTestResources);
