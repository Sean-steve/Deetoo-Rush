import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_HANDOVER_OTP, DEMO_PICKUP_CODE, OFFER_DURATION_SECONDS,
  activeDeliveryStatus, canCompleteDelivery, canConfirmPickup,
  deliveryReducer, initialDeliveryState, validateDeliveryIssue,
} from '../../apps/rider-android/src/preview/phase2-model';

function offer() {
  return deliveryReducer(initialDeliveryState, { type: 'NEW_OFFER' });
}
function accepted() {
  return deliveryReducer(offer(), { type: 'ACCEPT' });
}
function merchantArrival() {
  return deliveryReducer(deliveryReducer(accepted(), { type: 'GO_TO_MERCHANT' }), { type: 'ARRIVE_MERCHANT' });
}
function pickedUp() {
  let state = merchantArrival();
  state = deliveryReducer(state, { type: 'SET_ITEMS_CONFIRMED', value: true });
  state = deliveryReducer(state, { type: 'VERIFY_PICKUP_CODE', code: DEMO_PICKUP_CODE });
  return deliveryReducer(state, { type: 'CONFIRM_PICKUP' });
}
function customerArrival() {
  return deliveryReducer(deliveryReducer(pickedUp(), { type: 'GO_TO_CUSTOMER' }), { type: 'ARRIVE_CUSTOMER' });
}

test('New demo offer has exactly 25 seconds, expires and cannot then be accepted', () => {
  let state = offer();
  assert.equal(state.status, 'offered');
  assert.equal(state.offerSeconds, OFFER_DURATION_SECONDS);
  for (let i = 0; i < OFFER_DURATION_SECONDS; i++) state = deliveryReducer(state, { type: 'TICK' });
  assert.equal(state.status, 'expired');
  assert.equal(state.offerSeconds, 0);
  assert.equal(deliveryReducer(state, { type: 'ACCEPT' }).status, 'expired');
  state = deliveryReducer(state, { type: 'NEW_OFFER' });
  assert.equal(state.status, 'offered');
});

test('Declining an offer does not mark anything accepted', () => {
  const state = deliveryReducer(offer(), { type: 'DECLINE' });
  assert.equal(state.status, 'declined');
  assert.equal(deliveryReducer(state, { type: 'ACCEPT' }).status, 'declined');
});

test('Order cannot be picked up until merchant arrival, package item check and pickup reference', () => {
  const initial = merchantArrival();
  assert.equal(initial.status, 'at_merchant');
  assert.equal(canConfirmPickup(initial), false);
  assert.equal(deliveryReducer(initial, { type: 'CONFIRM_PICKUP' }).status, 'at_merchant');
  let checked = deliveryReducer(initial, { type: 'SET_ITEMS_CONFIRMED', value: true });
  checked = deliveryReducer(checked, { type: 'VERIFY_PICKUP_CODE', code: '0000' });
  assert.equal(canConfirmPickup(checked), false);
  checked = deliveryReducer(checked, { type: 'VERIFY_PICKUP_CODE', code: DEMO_PICKUP_CODE });
  assert.equal(canConfirmPickup(checked), true);
  const after = deliveryReducer(checked, { type: 'CONFIRM_PICKUP' });
  assert.equal(after.status, 'picked_up');
  assert.equal(after.screen, 'customerRoute');
});

test('Customer can only be marked delivered with valid demo PIN or staged photo after arrival', () => {
  const state = customerArrival();
  assert.equal(state.status, 'at_customer');
  assert.equal(canCompleteDelivery(state, 'otp', '000000'), false);
  assert.equal(deliveryReducer(state, { type: 'COMPLETE_DELIVERY', method: 'otp', otp: '000000' }).status, 'at_customer');
  assert.equal(deliveryReducer(state, { type: 'COMPLETE_DELIVERY', method: 'otp', otp: DEMO_HANDOVER_OTP }).status, 'delivered');
  assert.equal(canCompleteDelivery(state, 'photo', ''), false);
  const withPhoto = deliveryReducer(state, { type: 'STAGE_DELIVERY_PHOTO', staged: true });
  assert.equal(canCompleteDelivery(withPhoto, 'photo', ''), true);
  assert.equal(deliveryReducer(withPhoto, { type: 'COMPLETE_DELIVERY', method: 'photo', otp: '' }).status, 'delivered');
});

test('Unresolved customer incident prevents completion even with valid PIN', () => {
  let state = customerArrival();
  state = deliveryReducer(state, { type: 'REPORT_ISSUE', issue: 'Customer unavailable', description: 'Customer is not answering the intercom' });
  assert.equal(state.issue?.acknowledged, false);
  assert.equal(deliveryReducer(state, { type: 'COMPLETE_DELIVERY', method: 'otp', otp: DEMO_HANDOVER_OTP }).status, 'at_customer');
});

test('Missing item incidents prevent pickup and issue reports do not resolve orders', () => {
  let state = merchantArrival();
  state = deliveryReducer(state, { type: 'SET_ITEMS_CONFIRMED', value: true });
  state = deliveryReducer(state, { type: 'VERIFY_PICKUP_CODE', code: DEMO_PICKUP_CODE });
  state = deliveryReducer(state, { type: 'REPORT_ISSUE', issue: 'Missing or damaged items', description: 'One soda is missing from the bag' });
  assert.equal(canConfirmPickup(state), false);
  assert.equal(deliveryReducer(state, { type: 'CONFIRM_PICKUP' }).status, 'at_merchant');
  assert.equal(state.issue?.stage, 'pickup');
  assert.equal(state.issue?.acknowledged, false);
  assert.equal(state.info.includes('No support case has been created'), true);
});

test('Issue form rejects empty/short explanations and incorrect workflow transitions', () => {
  assert.match(validateDeliveryIssue('', '') || '', /category/);
  assert.match(validateDeliveryIssue('Other', 'late') || '', /10 characters/);
  assert.equal(validateDeliveryIssue('Merchant delay', 'Merchant requires 20 more minutes'), null);
  assert.equal(deliveryReducer(offer(), { type: 'ARRIVE_CUSTOMER' }).status, 'offered');
  assert.equal(deliveryReducer(accepted(), { type: 'CONFIRM_PICKUP' }).status, 'accepted');
  assert.equal(activeDeliveryStatus(accepted().status), true);
  assert.equal(activeDeliveryStatus(initialDeliveryState.status), false);
});

test('Visual review preset is explicit and reset returns to an unassigned mock state', () => {
  const stage = deliveryReducer(initialDeliveryState, { type: 'DEMO_STAGE', screen: 'handover' });
  assert.equal(stage.status, 'at_customer');
  assert.match(stage.info, /Visual review/);
  const reset = deliveryReducer(stage, { type: 'RESET' });
  assert.equal(reset.status, 'idle');
  assert.equal(reset.issue, null);
});
