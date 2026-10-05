import { freezeFixtureEconomics, initiateFixturePayment, fixtureCallback, approvedFixtureRefund } from '../helpers/paid-order';
/**
 * DEETOO - Sprint 11 Unit & Integration Tests
 * Authoritative Payment State Machine, M-PESA & Card Providers, Callback Verification,
 * Duplicate-Callback Protection, Idempotency, and Full/Partial Refund Foundation
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PaymentStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentReconciliationStatus,
  RefundStatus,
  RefundReasonCode,
  OrderStatus,
  Order,
} from '@deetoo/types';
import { formatMpesaPhone } from '@deetoo/validation';
import { PaymentStateMachine } from '../../apps/api/src/modules/payment/payment.state-machine';
import { paymentRepository } from '../../apps/api/src/modules/payment/payment.repository';
import { paymentService } from '../../apps/api/src/modules/payment/payment.service';
import { orderRepository } from '../../apps/api/src/modules/order/order.repository';
import { MpesaPaymentProvider } from '../../apps/api/src/modules/payment/providers/mpesa.provider';
import { CardPaymentProvider } from '../../apps/api/src/modules/payment/providers/card.provider';

describe('Sprint 11: Payments, M-PESA, State Machine, Callbacks & Refunds', () => {
  const testCustomerId = 'cust_sprint11_01';
  const testOrderId = 'ord_sprint11_test_01';
  const testOrderTotalMinor = 150000; // 1,500.00 KES

  beforeEach(async () => {
    // Reset in-memory maps to isolate tests
    paymentRepository.clearInMemory();

    // Setup a clean order in orderRepository
    const mockOrder: Order = {
      id: testOrderId,
      public_code: 'DT-TEST11',
      order_number: 'ORD-2026-1101',
      checkout_quote_id: 'quote_sprint11_01',
      customer_id: testCustomerId,
      customer_name: 'Faith Achieng',
      customer_phone: '+254712345678',
      branch_id: 'branch_sprint11_01',
      branch_name: 'Deetoo Kitchen Kilimani',
      merchant_id: 'merch_sprint11_01',
      merchant_name: 'Deetoo Kitchen',
      status: OrderStatus.PENDING_PAYMENT,
      currency: 'KES',
      subtotal_minor: 120000,
      delivery_fee_minor: 25000,
      service_fee_minor: 5000,
      discount_minor: 0,
      total_minor: testOrderTotalMinor,
      items: [],
      delivery_address_snapshot: {
        recipient_name: 'Faith Achieng',
        formatted_address: 'Argwings Kodhek Rd',
        location: {
          latitude: -1.2921,
          longitude: 36.7845,
        },
      },
      pricing_snapshot: {} as any,
      timeline: [],
      placed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    };

    await freezeFixtureEconomics(mockOrder);
    // Store in mock memory
    (orderRepository as any).orders.set(testOrderId, mockOrder);
  });

  // ==========================================
  // 1. Phone Normalization & Validation
  // ==========================================
  test('1. M-PESA phone normalization handles 07..., 254..., and +254... formats', () => {
    assert.equal(formatMpesaPhone('0712345678'), '254712345678');
    assert.equal(formatMpesaPhone('+254712345678'), '254712345678');
    assert.equal(formatMpesaPhone('254712345678'), '254712345678');
    assert.equal(formatMpesaPhone('0112345678'), '254112345678');
  });

  // ==========================================
  // 2. Authoritative Payment State Machine
  // ==========================================
  test('2. Payment State Machine allows valid lifecycle transitions and prevents invalid regression', () => {
    // Valid forward transitions
    assert.equal(PaymentStateMachine.canTransitionPayment(PaymentStatus.INITIATED, PaymentStatus.PENDING), true);
    assert.equal(PaymentStateMachine.canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.CAPTURED), true);
    assert.equal(PaymentStateMachine.canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.FAILED), true);
    assert.equal(PaymentStateMachine.canTransitionPayment(PaymentStatus.PENDING, PaymentStatus.CANCELLED), true);
    assert.equal(PaymentStateMachine.canTransitionPayment(PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED), true);
    assert.equal(PaymentStateMachine.canTransitionPayment(PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED), true);
    assert.equal(PaymentStateMachine.canTransitionPayment(PaymentStatus.CAPTURED, PaymentStatus.REFUNDED), true);

    // Forbidden backwards regression
    assert.equal(PaymentStateMachine.canTransitionPayment(PaymentStatus.CAPTURED, PaymentStatus.PENDING), false);
    assert.equal(PaymentStateMachine.canTransitionPayment(PaymentStatus.CAPTURED, PaymentStatus.FAILED), false);
    assert.equal(PaymentStateMachine.canTransitionPayment(PaymentStatus.CAPTURED, PaymentStatus.CANCELLED), false);
    assert.equal(PaymentStateMachine.canTransitionPayment(PaymentStatus.REFUNDED, PaymentStatus.CAPTURED), false);

    // Validate throws on invalid transition
    assert.throws(() => {
      PaymentStateMachine.validatePaymentTransition(PaymentStatus.CAPTURED, PaymentStatus.PENDING);
    });
  });

  // ==========================================
  // 3. Refund State Machine
  // ==========================================
  test('3. Refund State Machine enforces valid lifecycle', () => {
    assert.equal(PaymentStateMachine.canTransitionRefund(RefundStatus.REQUESTED, RefundStatus.PENDING), true);
    assert.equal(PaymentStateMachine.canTransitionRefund(RefundStatus.REQUESTED, RefundStatus.SUCCEEDED), true);
    assert.equal(PaymentStateMachine.canTransitionRefund(RefundStatus.PENDING, RefundStatus.SUCCEEDED), true);
    assert.equal(PaymentStateMachine.canTransitionRefund(RefundStatus.PENDING, RefundStatus.FAILED), true);
    assert.equal(PaymentStateMachine.canTransitionRefund(RefundStatus.SUCCEEDED, RefundStatus.REQUESTED), false);
  });

  // ==========================================
  // 4. Payment Initiation (M-PESA)
  // ==========================================
  test('4. Initiates M-PESA STK push and transitions payment to PENDING with provider reference', async () => {
    const payment = await initiateFixturePayment({
      orderId: testOrderId,
      customerId: testCustomerId,
      method: 'MPESA',
      phone: '0712345678',
    });

    assert.match(payment.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(payment.order_id, testOrderId);
    assert.equal(payment.customer_id, testCustomerId);
    assert.equal(payment.status, PaymentStatus.PENDING);
    assert.equal(payment.method, PaymentMethod.MPESA);
    assert.equal(payment.amount_minor, testOrderTotalMinor);
    assert.equal(payment.phone, '0712345678');
    assert.ok(payment.checkout_request_id);
    assert.ok(payment.merchant_request_id);

    // Audit timeline entry recorded
    const timeline = await paymentRepository.getPaymentTimeline(payment.id);
    assert.ok(timeline.length >= 2); // INITIATED and PENDING
    assert.equal(timeline[0].event_type, 'PAYMENT_INITIATED');
    assert.equal(timeline[1].event_type, 'PAYMENT_PENDING');
  });

  // ==========================================
  // 5. Idempotent Payment Initiation
  // ==========================================
  test('5. Idempotent payment initiation with same key returns identical active payment', async () => {
    const customIdemKey = 'idem_unique_test_key_123';

    const p1 = await initiateFixturePayment({
      orderId: testOrderId,
      customerId: testCustomerId,
      method: 'MPESA',
      phone: '0712345678',
      idempotencyKey: customIdemKey,
    });

    const p2 = await initiateFixturePayment({
      orderId: testOrderId,
      customerId: testCustomerId,
      method: 'MPESA',
      phone: '0712345678',
      idempotencyKey: customIdemKey,
    });

    assert.equal(p1.id, p2.id);
    assert.equal(p1.checkout_request_id, p2.checkout_request_id);
  });

  // ==========================================
  // 6. Safaricom M-PESA Callback Handling (Success)
  // ==========================================
  test('6. Successful M-PESA callback captures payment, records receipt number, and sets MATCHED reconciliation', async () => {
    // Initiate payment
    const payment = await initiateFixturePayment({
      orderId: testOrderId,
      customerId: testCustomerId,
      method: 'MPESA',
      phone: '0712345678',
    });

    const checkoutReqId = payment.checkout_request_id!;
    const merchantReqId = payment.merchant_request_id!;
    const mockMpesaReceipt = 'QGH876TR43';

    // Mock Safaricom Daraja STK Push Callback Payload
    const callbackPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: merchantReqId,
          CheckoutRequestID: checkoutReqId,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 1500 },
              { Name: 'MpesaReceiptNumber', Value: mockMpesaReceipt },
              { Name: 'TransactionDate', Value: 20260910123000 },
              { Name: 'PhoneNumber', Value: 254712345678 },
            ],
          },
        },
      },
    };

    const result = await fixtureCallback(
      'MPESA',
      {},
      JSON.stringify(callbackPayload),
      callbackPayload
    );

    assert.equal(result.acknowledged, true);
    assert.equal(result.paymentId, payment.id);

    // Verify payment updated
    const updated = await paymentRepository.findPaymentById(payment.id);
    assert.ok(updated);
    assert.equal(updated.status, PaymentStatus.CAPTURED);
    assert.equal(updated.captured_minor, testOrderTotalMinor);
    assert.equal(updated.mpesa_receipt_number, mockMpesaReceipt);
    assert.equal(updated.reconciliation_status, PaymentReconciliationStatus.MATCHED);
    assert.ok(updated.captured_at);

    // Verify duplicate callback protection
    const dupResult = await fixtureCallback(
      'MPESA',
      {},
      JSON.stringify(callbackPayload),
      callbackPayload
    );
    assert.equal(dupResult.acknowledged, true);
    assert.equal(dupResult.duplicate, true);
  });

  // ==========================================
  // 7. Duplicate Payment Prevention on Captured Order
  // ==========================================
  test('7. Cannot initiate new payment for an order that is already paid', async () => {
    // Initiate and capture
    const payment = await initiateFixturePayment({
      orderId: testOrderId,
      customerId: testCustomerId,
      method: 'MPESA',
      phone: '0712345678',
    });

    await fixtureCallback(
      'MPESA',
      {},
      '',
      {
        Body: {
          stkCallback: {
            MerchantRequestID: payment.merchant_request_id,
            CheckoutRequestID: payment.checkout_request_id,
            ResultCode: 0,
            ResultDesc: 'Success',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 1500 },
                { Name: 'MpesaReceiptNumber', Value: 'REC999999' },
              ],
            },
          },
        },
      }
    );

    // Attempting to pay again must be rejected
    await assert.rejects(
      async () => {
        await initiateFixturePayment({
          orderId: testOrderId,
          customerId: testCustomerId,
          method: 'MPESA',
          phone: '0712345678',
          idempotencyKey: 'new_attempt_key',
        });
      },
      {
        code: 'ORDER_NOT_PAYABLE',
      }
    );
  });

  // ==========================================
  // 8. Protection Against State Regression on Late Callback
  // ==========================================
  test('8. Late failure callback does not regress an already CAPTURED payment', async () => {
    const payment = await initiateFixturePayment({
      orderId: testOrderId,
      customerId: testCustomerId,
      method: 'MPESA',
      phone: '0712345678',
    });

    // Capture first
    await fixtureCallback(
      'MPESA',
      {},
      '',
      {
        Body: {
          stkCallback: {
            MerchantRequestID: payment.merchant_request_id,
            CheckoutRequestID: payment.checkout_request_id,
            ResultCode: 0,
            ResultDesc: 'Success',
            CallbackMetadata: {
              Item: [{ Name: 'Amount', Value: testOrderTotalMinor / 100 }, { Name: 'MpesaReceiptNumber', Value: 'REC123456' }],
            },
          },
        },
      }
    );

    // Now send a late failure callback with different event ID
    await fixtureCallback(
      'MPESA',
      {},
      '',
      {
        Body: {
          stkCallback: {
            MerchantRequestID: payment.merchant_request_id,
            CheckoutRequestID: payment.checkout_request_id,
            ResultCode: 1032,
            ResultDesc: 'Request cancelled by user',
          },
        },
      }
    );

    const postCheck = await paymentRepository.findPaymentById(payment.id);
    assert.equal(postCheck?.status, PaymentStatus.CAPTURED);
  });

  // ==========================================
  // 9. Admin Full and Partial Refund Processing
  // ==========================================
  test('9. Admin refund processes partial refund, updates status to PARTIALLY_REFUNDED, then full to REFUNDED', async () => {
    // Initiate and capture
    const payment = await initiateFixturePayment({
      orderId: testOrderId,
      customerId: testCustomerId,
      method: 'MPESA',
      phone: '0712345678',
    });

    await fixtureCallback(
      'MPESA',
      {},
      '',
      {
        Body: {
          stkCallback: {
            MerchantRequestID: payment.merchant_request_id,
            CheckoutRequestID: payment.checkout_request_id,
            ResultCode: 0,
            ResultDesc: 'Success',
            CallbackMetadata: {
              Item: [{ Name: 'Amount', Value: testOrderTotalMinor / 100 }, { Name: 'MpesaReceiptNumber', Value: 'REC_REFUND_TEST' }],
            },
          },
        },
      }
    );

    // 1. Partial Refund: 500.00 KES (50,000 minor)
    const partialRefund = await approvedFixtureRefund({
      paymentId: payment.id,
      amountMinor: 50000,
      reasonCode: RefundReasonCode.ITEM_MISSING,
      note: 'Soda missing from order',
      requestedBy: 'admin_usr_01',
    });

    assert.equal(partialRefund.status, RefundStatus.SUCCEEDED);
    assert.equal(partialRefund.amount_minor, 50000);
    assert.ok(partialRefund.provider_refund_id);

    const pAfterPartial = await paymentRepository.findPaymentById(payment.id);
    assert.equal(pAfterPartial?.status, PaymentStatus.PARTIALLY_REFUNDED);
    assert.equal(pAfterPartial?.refunded_minor, 50000);

    // 2. Reject refund exceeding remaining balance: remaining is 100,000 minor, attempt 120,000
    await assert.rejects(
      async () => {
        await approvedFixtureRefund({
          paymentId: payment.id,
          amountMinor: 120000,
          reasonCode: RefundReasonCode.CUSTOMER_SUPPORT_ADJUSTMENT,
          requestedBy: 'admin_usr_01',
        });
      },
      {
        code: 'REFUND_EXCEEDS_AVAILABLE_BALANCE',
      }
    );

    // 3. Complete remaining refund: 100,000 minor
    const finalRefund = await approvedFixtureRefund({
      paymentId: payment.id,
      amountMinor: 100000,
      reasonCode: RefundReasonCode.ORDER_CANCELLED,
      requestedBy: 'admin_usr_01',
    });

    assert.equal(finalRefund.status, RefundStatus.SUCCEEDED);

    const pAfterFinal = await paymentRepository.findPaymentById(payment.id);
    assert.equal(pAfterFinal?.status, PaymentStatus.REFUNDED);
    assert.equal(pAfterFinal?.refunded_minor, testOrderTotalMinor);
    assert.ok(pAfterFinal?.refunded_at);

    // 4. Any further refund is completely rejected
    await assert.rejects(
      async () => {
        await approvedFixtureRefund({
          paymentId: payment.id,
          amountMinor: 1000,
          reasonCode: RefundReasonCode.CUSTOMER_SUPPORT_ADJUSTMENT,
          requestedBy: 'admin_usr_01',
        });
      },
      {
        code: 'REFUND_EXCEEDS_AVAILABLE_BALANCE',
      }
    );
  });

  // ==========================================
  // 10. Card Payment Provider
  // ==========================================
  test('10. Card payment provider initiates and parses tokenized card webhooks', async () => {
    const cardProvider = new CardPaymentProvider();

    const initResult = await cardProvider.initiatePayment({
      paymentId: 'pay_card_test_01',
      orderId: testOrderId,
      orderNumber: 'ORD-1101',
      amountMinor: 50000,
      currency: 'KES',
      paymentMethodToken: 'tok_visa_4242',
    });

    assert.equal(initResult.success, true);
    assert.ok(initResult.providerPaymentId);
    assert.ok(initResult.clientSecret);

    // Parse card webhook
    const mockWebhook = {
      id: 'evt_card_999',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: initResult.providerPaymentId,
          amount: 50000,
          currency: 'KES',
          status: 'succeeded',
        },
      },
    };

    const parsed = cardProvider.parseCallback(mockWebhook);
    assert.equal(parsed.isValid, true);
    assert.equal(parsed.status, 'SUCCESS');
    assert.equal(parsed.amountMinor, 50000);
    assert.equal(parsed.checkoutRequestId, initResult.providerPaymentId);
    assert.ok(parsed.providerReference);
  });
});
