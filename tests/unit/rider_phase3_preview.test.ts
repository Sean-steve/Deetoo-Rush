import assert from 'node:assert/strict';
import test from 'node:test';
import {
  financeBreakdownEqualsTotal, filterHistory, initialWallet,
  nextMultiStop, overview, routeSequenceValid, sampleHistory, sampleMultiStops,
  sampleCharts, validatePayout, walletReducer, withdrawalSummary,
} from '../../apps/rider-android/src/preview/phase3-model';

test('Earnings breakdown matches mock declared totals and trend periods are populated', () => {
  assert.equal(financeBreakdownEqualsTotal(overview), true);
  assert.equal(overview.totalEarned, 28450);
  for (const period of ['Daily', 'Weekly', 'Monthly'] as const) {
    assert.ok(sampleCharts[period].length >= 4);
    assert.ok(sampleCharts[period].every(point => point.base > 0 && point.bonus >= 0));
  }
});

test('History filters distinguish completed, cancelled, failed and date/search', () => {
  assert.equal(filterHistory(sampleHistory, 'Completed', '30 days', '').length, 4);
  assert.equal(filterHistory(sampleHistory, 'Cancelled', '30 days', '').length, 1);
  assert.equal(filterHistory(sampleHistory, 'Failed', '30 days', '').length, 1);
  assert.equal(filterHistory(sampleHistory, 'All', 'Today', '').length, 2);
  assert.equal(filterHistory(sampleHistory, 'All', '7 days', '').length, 6);
  assert.equal(filterHistory(sampleHistory, 'All', '30 days', '#DR-78425').length, 1);
  assert.equal(filterHistory(sampleHistory, 'All', '30 days', 'kilimani').length, 3);
  assert.equal(filterHistory(sampleHistory, 'Failed', 'Today', '').length, 0);
  assert.equal(filterHistory(sampleHistory, 'All', '30 days', 'missing-value').length, 0);
});

test('Rider wallet financial categories remain separate', () => {
  const summary = withdrawalSummary(initialWallet);
  assert.deepEqual(summary, { available: 12480, pending: 8120, cashOwed: 780, earned: 28450 });
  assert.notEqual(summary.available, summary.earned + initialWallet.cashCollected - summary.cashOwed);
});

test('Mock payout validates amount, M-PESA phone and confirmation', () => {
  assert.match(validatePayout('', '0712345678', 12480, true) || '', /amount/);
  assert.match(validatePayout('1.01', '0712345678', 12480, true) || '', /whole shillings/);
  assert.match(validatePayout('99', '0712345678', 12480, true) || '', /100/);
  assert.match(validatePayout('12481', '0712345678', 12480, true) || '', /exceeds/);
  assert.match(validatePayout('100', '1234', 12480, true) || '', /Kenyan/);
  assert.match(validatePayout('100', '0712345678', 12480, false) || '', /Confirm/);
  assert.equal(validatePayout('12480', '+254712345678', 12480, true), null);
});

test('Requesting a simulated payout reserves funds and creates pending record', () => {
  const wallet = walletReducer(initialWallet, { type: 'REQUEST_PAYOUT', amountText: '1000', phone: '0712345678', confirmed: true });
  assert.equal(wallet.available, 11480);
  assert.equal(wallet.pendingPayouts, 9120);
  assert.equal(wallet.totalEarned, initialWallet.totalEarned);
  assert.equal(wallet.cashOutstanding, initialWallet.cashOutstanding);
  assert.equal(wallet.payouts[0].status, 'Processing');
  assert.match(wallet.payouts[0].reference, /^DEMO-MPESA-/);
  assert.equal(wallet.transactions[0].status, 'Pending');
  assert.equal(wallet.transactions[0].amount, -1000);
  assert.ok(wallet.lastMessage.includes('No money has been sent'));
});

test('Invalid request leaves balance and payout count untouched', () => {
  const wallet = walletReducer(initialWallet, { type: 'REQUEST_PAYOUT', amountText: '9999999', phone: '0712345678', confirmed: true });
  assert.equal(wallet.available, initialWallet.available);
  assert.equal(wallet.pendingPayouts, initialWallet.pendingPayouts);
  assert.equal(wallet.payouts.length, initialWallet.payouts.length);
});

test('Simulated successful settlement transitions once and never releases funds back', () => {
  const requested = walletReducer(initialWallet, { type: 'REQUEST_PAYOUT', amountText: '2000', phone: '0712345678', confirmed: true });
  const id = requested.payouts[0].id;
  const settled = walletReducer(requested, { type: 'SIMULATE_PAYOUT_RESULT', id, result: 'Completed' });
  assert.equal(settled.available, 10480);
  assert.equal(settled.pendingPayouts, 8120);
  assert.equal(settled.payouts[0].status, 'Completed');
  assert.equal(settled.transactions[0].status, 'Completed');
  const repeated = walletReducer(settled, { type: 'SIMULATE_PAYOUT_RESULT', id, result: 'Completed' });
  assert.equal(repeated.available, settled.available);
  assert.equal(repeated.pendingPayouts, settled.pendingPayouts);
});

test('Simulated failed payout refunds exactly once with clear failed status', () => {
  const requested = walletReducer(initialWallet, { type: 'REQUEST_PAYOUT', amountText: '800', phone: '0712345678', confirmed: true });
  const id = requested.payouts[0].id;
  const failed = walletReducer(requested, { type: 'SIMULATE_PAYOUT_RESULT', id, result: 'Failed' });
  assert.equal(failed.available, initialWallet.available);
  assert.equal(failed.pendingPayouts, initialWallet.pendingPayouts);
  assert.equal(failed.payouts[0].status, 'Failed');
  assert.equal(failed.transactions[0].status, 'Failed');
  const repeated = walletReducer(failed, { type: 'SIMULATE_PAYOUT_RESULT', id, result: 'Failed' });
  assert.equal(repeated.available, failed.available);
  assert.equal(repeated.pendingPayouts, failed.pendingPayouts);
});

test('Cash review creates a pending case without reconciling or altering cash figures', () => {
  const invalid = walletReducer(initialWallet, { type: 'REQUEST_CASH_REVIEW', description: 'short' });
  assert.equal(invalid.cashReviewPending, false);
  const pending = walletReducer(initialWallet, { type: 'REQUEST_CASH_REVIEW', description: 'Cash received differs from order receipt' });
  assert.equal(pending.cashReviewPending, true);
  assert.equal(pending.cashOutstanding, initialWallet.cashOutstanding);
  assert.equal(pending.cashCollected, initialWallet.cashCollected);
  assert.equal(pending.available, initialWallet.available);
  assert.equal(pending.transactions[0].status, 'Under review');
  const repeated = walletReducer(pending, { type: 'REQUEST_CASH_REVIEW', description: 'Another disputed amount' });
  assert.equal(repeated.transactions.length, pending.transactions.length);
});

test('Dispatch stop sequence is fixed and advances in defined order only', () => {
  assert.equal(routeSequenceValid(sampleMultiStops.map(stop => stop.id)), true);
  assert.equal(routeSequenceValid(['drop1', 'pickup', 'drop2']), false);
  assert.equal(routeSequenceValid(['pickup', 'drop2']), false);
  let stop: 0 | 1 | 2 | 3 = 0;
  stop = nextMultiStop(stop);
  assert.equal(stop, 1);
  stop = nextMultiStop(stop);
  assert.equal(stop, 2);
  stop = nextMultiStop(stop);
  assert.equal(stop, 3);
  assert.equal(nextMultiStop(stop), 3);
});

test('Wallet reset restores clean fixtures and removes simulated payouts', () => {
  const requested = walletReducer(initialWallet, { type: 'REQUEST_PAYOUT', amountText: '500', phone: '0712345678', confirmed: true });
  const reset = walletReducer(requested, { type: 'RESET' });
  assert.equal(reset.available, initialWallet.available);
  assert.equal(reset.payouts.length, initialWallet.payouts.length);
  assert.equal(reset.nextSequence, 1);
});
