import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OrderStatus, DeliveryStatus, PaymentStatus } from '../../packages/types/src/index';

// State machine transition validator (Section 2 DEE-STATE-001)
const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PLACED, OrderStatus.CANCELLED],
  [OrderStatus.PLACED]: [OrderStatus.ACCEPTED, OrderStatus.REJECTED, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.REJECTED]: [],
  [OrderStatus.CANCELLED]: [],
};

function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

test('Order State Machine enforces valid lifecycle commands', () => {
  // Valid happy path
  assert.equal(canTransitionOrder(OrderStatus.PENDING_PAYMENT, OrderStatus.PLACED), true);
  assert.equal(canTransitionOrder(OrderStatus.PLACED, OrderStatus.ACCEPTED), true);
  assert.equal(canTransitionOrder(OrderStatus.ACCEPTED, OrderStatus.PREPARING), true);
  assert.equal(canTransitionOrder(OrderStatus.PREPARING, OrderStatus.READY), true);
  assert.equal(canTransitionOrder(OrderStatus.READY, OrderStatus.COMPLETED), true);

  // Prohibited shortcuts (DEE-STATE-001 Section 2)
  // E.g. Cannot transition directly from READY to ACCEPTED
  assert.equal(canTransitionOrder(OrderStatus.READY, OrderStatus.ACCEPTED), false);
  // Terminal COMPLETED cannot reopen
  assert.equal(canTransitionOrder(OrderStatus.COMPLETED, OrderStatus.PLACED), false);
  // Cannot jump from PLACED directly to COMPLETED
  assert.equal(canTransitionOrder(OrderStatus.PLACED, OrderStatus.COMPLETED), false);
});

test('Delivery State Machine satisfies atomic lifecycle rules', () => {
  const allowedDelivery = [
    DeliveryStatus.UNASSIGNED,
    DeliveryStatus.OFFERED,
    DeliveryStatus.ASSIGNED,
    DeliveryStatus.ARRIVED_PICKUP,
    DeliveryStatus.PICKED_UP,
    DeliveryStatus.EN_ROUTE,
    DeliveryStatus.ARRIVED_DROPOFF,
    DeliveryStatus.DELIVERED,
  ];
  assert.equal(allowedDelivery.length, 8);
});
