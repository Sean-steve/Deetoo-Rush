/**
 * Rider Phase 3: deterministic sample financial and delivery data.
 * All amounts are mock Kenyan shillings (whole KSh for display only).
 * Ledger, payout, reconciliation and order assignment never call DeeToo APIs.
 */
import { validKenyanPhone } from './phase1-model';

export type HistoryState = 'Completed' | 'Cancelled' | 'Failed';
export type HistoryFilter = 'All' | HistoryState;
export type RangeFilter = 'Today' | '7 days' | '30 days';
export type ChartPeriod = 'Daily' | 'Weekly' | 'Monthly';
export type FinanceView = 'earnings' | 'wallet' | 'payouts';
export type DeliveryView = 'active' | 'history' | 'operations';
export type DemoPayoutStatus = 'Processing' | 'Completed' | 'Failed';
export type MockStopState = 0 | 1 | 2 | 3;

export type HistoryOrder = {
  id: string;
  merchant: string;
  customer: string;
  route: string;
  date: string;
  time: string;
  status: HistoryState;
  durationMinutes: number;
  distanceKm: number;
  riderEarnings: number;
  note: string;
  payoutStatus: 'Credited' | 'Under review' | 'Not applicable';
};
export const sampleHistory: HistoryOrder[] = [
  { id: '#DR-78425', merchant: 'Burger Hub', customer: 'Emily Wanjiru', route: 'Westlands → Kilimani', date: '2026-10-11', time: '10:08', status: 'Completed', durationMinutes: 56, distanceKm: 8.7, riderEarnings: 470, note: 'Delivered with verified handover', payoutStatus: 'Credited' },
  { id: '#DR-78424', merchant: 'Java House', customer: 'James Mwangi', route: 'Upper Hill → CBD', date: '2026-10-11', time: '08:34', status: 'Completed', durationMinutes: 34, distanceKm: 5.1, riderEarnings: 350, note: 'Delivered on time', payoutStatus: 'Credited' },
  { id: '#DR-78423', merchant: 'Pizza Palace', customer: 'Grace Njeri', route: 'Kilimani → Westlands', date: '2026-10-10', time: '19:21', status: 'Completed', durationMinutes: 42, distanceKm: 6.4, riderEarnings: 420, note: 'Customer confirmed receipt', payoutStatus: 'Credited' },
  { id: '#DR-78422', merchant: 'Java House', customer: 'Daniel Kariuki', route: 'Ngong Road → Lavington', date: '2026-10-10', time: '14:18', status: 'Cancelled', durationMinutes: 18, distanceKm: 2.4, riderEarnings: 80, note: 'Cancellation fee review required', payoutStatus: 'Under review' },
  { id: '#DR-78421', merchant: 'Burger Hub', customer: 'Amina Otieno', route: 'Westlands → Upper Hill', date: '2026-10-09', time: '18:12', status: 'Failed', durationMinutes: 28, distanceKm: 4.8, riderEarnings: 0, note: 'Customer unavailable; case under investigation', payoutStatus: 'Under review' },
  { id: '#DR-78420', merchant: 'Sushi Express', customer: 'Mary Wanjiru', route: 'CBD → Kilimani', date: '2026-10-06', time: '13:43', status: 'Completed', durationMinutes: 40, distanceKm: 7.1, riderEarnings: 400, note: 'Handover completed', payoutStatus: 'Credited' },
];
export function filterHistory(
  orders: HistoryOrder[], status: HistoryFilter, range: RangeFilter, query: string, now = '2026-10-11',
): HistoryOrder[] {
  const day = Date.parse(now + 'T00:00:00Z');
  const days = range === 'Today' ? 0 : range === '7 days' ? 6 : 29;
  const needle = query.trim().toLowerCase();
  return orders.filter(order => {
    const diff = Math.floor((day - Date.parse(order.date + 'T00:00:00Z')) / 86_400_000);
    return diff >= 0 && diff <= days &&
      (status === 'All' || order.status === status) &&
      (!needle || [order.id, order.merchant, order.customer, order.route].some(value => value.toLowerCase().includes(needle)));
  });
}
export type FinanceOverview = {
  totalEarned: number;
  base: number;
  timeBonuses: number;
  peakBonuses: number;
  distanceBonuses: number;
  otherAdjustments: number;
  paidOut: number;
  completedDeliveries: number;
  averageDeliveryMinutes: number;
  totalDistanceKm: number;
};
export const overview: FinanceOverview = {
  totalEarned: 28450, base: 21600, timeBonuses: 2200, peakBonuses: 1350,
  distanceBonuses: 700, otherAdjustments: 2600, paidOut: 20000,
  completedDeliveries: 124, averageDeliveryMinutes: 56, totalDistanceKm: 312,
};
export function financeBreakdownEqualsTotal(data: FinanceOverview): boolean {
  return data.base + data.timeBonuses + data.peakBonuses + data.distanceBonuses + data.otherAdjustments === data.totalEarned;
}
export const sampleCharts: Record<ChartPeriod, { label: string; base: number; bonus: number }[]> = {
  Daily: [
    { label: 'Mon', base: 2200, bonus: 350 }, { label: 'Tue', base: 2950, bonus: 470 },
    { label: 'Wed', base: 2650, bonus: 250 }, { label: 'Thu', base: 3400, bonus: 520 },
    { label: 'Fri', base: 4200, bonus: 620 }, { label: 'Sat', base: 4600, bonus: 810 },
    { label: 'Sun', base: 3050, bonus: 380 },
  ],
  Weekly: [
    { label: 'W1', base: 4600, bonus: 800 }, { label: 'W2', base: 5500, bonus: 1100 },
    { label: 'W3', base: 6000, bonus: 1050 }, { label: 'W4', base: 5500, bonus: 1300 },
  ],
  Monthly: [
    { label: 'May', base: 14000, bonus: 2100 }, { label: 'Jun', base: 16000, bonus: 2200 },
    { label: 'Jul', base: 17100, bonus: 2750 }, { label: 'Aug', base: 18800, bonus: 3010 },
    { label: 'Sep', base: 19800, bonus: 3220 }, { label: 'Oct', base: 21600, bonus: 4250 },
  ],
};
export const achievements = [
  { title: 'Top performer', detail: '100+ completed deliveries this month', icon: '★' },
  { title: 'Peak-hour hero', detail: '5 eligible bonus deliveries this week', icon: '⚡' },
];
export type MoneyTransactionKind = 'Earnings' | 'Payout' | 'Cash collected' | 'Bonus' | 'Cash settlement request';
export type MoneyTransaction = {
  id: string; date: string; kind: MoneyTransactionKind; title: string; amount: number; reference: string; status: 'Completed' | 'Pending' | 'Failed' | 'Under review';
};
export const sampleTransactions: MoneyTransaction[] = [
  { id: 'tx-1', date: 'Oct 11, 10:08', kind: 'Earnings', title: 'Delivery #DR-78425', amount: 470, reference: 'DEMO-EARN-78425', status: 'Completed' },
  { id: 'tx-2', date: 'Oct 11, 08:34', kind: 'Cash collected', title: 'Cash order from Java House', amount: 620, reference: 'DEMO-CASH-78424', status: 'Completed' },
  { id: 'tx-3', date: 'Oct 10, 16:15', kind: 'Payout', title: 'M-PESA rider payout', amount: -5000, reference: 'DEMO-PAYOUT-7821', status: 'Completed' },
  { id: 'tx-4', date: 'Oct 10, 10:00', kind: 'Bonus', title: 'Performance bonus', amount: 1000, reference: 'DEMO-BONUS-94', status: 'Completed' },
];
export type DemoPayout = { id: string; amount: number; phone: string; status: DemoPayoutStatus; createdAt: string; reference: string; reason?: string };
export const samplePayouts: DemoPayout[] = [
  { id: 'p-7843', amount: 20000, phone: '0723***467', status: 'Completed', createdAt: 'Oct 08, 14:18', reference: 'DEMO-PAYOUT-7843' },
  { id: 'p-7821', amount: 5000, phone: '0723***467', status: 'Completed', createdAt: 'Oct 10, 16:15', reference: 'DEMO-PAYOUT-7821' },
];
export type WalletState = {
  available: number;
  pendingPayouts: number;
  cashCollected: number; // actual cash rider was handed; not account earnings
  cashOutstanding: number; // amount requiring cashier/admin reconciliation
  totalEarned: number; // period earnings; deliberately not sum of wallet values
  payoutPhone: string;
  payouts: DemoPayout[];
  transactions: MoneyTransaction[];
  cashReviewPending: boolean;
  nextSequence: number;
  lastMessage: string;
};
export const initialWallet: WalletState = {
  available: 12480,
  pendingPayouts: 8120,
  cashCollected: 3250,
  cashOutstanding: 780,
  totalEarned: overview.totalEarned,
  payoutPhone: '0712345678',
  payouts: samplePayouts,
  transactions: sampleTransactions,
  cashReviewPending: false,
  nextSequence: 1,
  lastMessage: '',
};
export type WalletAction =
  | { type: 'REQUEST_PAYOUT'; amountText: string; phone: string; confirmed: boolean }
  | { type: 'SIMULATE_PAYOUT_RESULT'; id: string; result: 'Completed' | 'Failed' }
  | { type: 'REQUEST_CASH_REVIEW'; description: string }
  | { type: 'DISMISS_MESSAGE' }
  | { type: 'RESET' };
export function validatePayout(
  amountText: string, phone: string, available: number, confirmed: boolean,
): string | null {
  const raw = amountText.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return 'Enter an amount in KSh (up to two decimal places).';
  const amount = Number(raw);
  if (!Number.isSafeInteger(amount) || amount < 100) return 'Demo withdrawals start at KSh 100 and must use whole shillings.';
  if (amount > available) return 'Amount exceeds the available withdrawal balance.';
  if (!validKenyanPhone(phone)) return 'Enter a valid Kenyan M-PESA phone number.';
  if (!confirmed) return 'Confirm the amount and destination before requesting a payout.';
  return null;
}
export function walletReducer(state: WalletState, action: WalletAction): WalletState {
  if (action.type === 'RESET') return { ...initialWallet, payouts: [...samplePayouts], transactions: [...sampleTransactions] };
  if (action.type === 'DISMISS_MESSAGE') return { ...state, lastMessage: '' };
  if (action.type === 'REQUEST_CASH_REVIEW') {
    if (state.cashReviewPending) return { ...state, lastMessage: 'A mock cash review request is already pending.' };
    if (action.description.trim().length < 10) return { ...state, lastMessage: 'Describe your cash discrepancy in at least 10 characters.' };
    return {
      ...state, cashReviewPending: true,
      transactions: [
        { id: 'cash-review-' + state.nextSequence, date: 'Oct 11, preview', kind: 'Cash settlement request', title: action.description.trim(), amount: 0, reference: 'DEMO-CASH-REVIEW-' + state.nextSequence, status: 'Under review' },
        ...state.transactions,
      ],
      nextSequence: state.nextSequence + 1,
      lastMessage: 'Cash discrepancy queued for simulated admin review. Cash owed was NOT changed.',
    };
  }
  if (action.type === 'REQUEST_PAYOUT') {
    const error = validatePayout(action.amountText, action.phone, state.available, action.confirmed);
    if (error) return { ...state, lastMessage: error };
    const amount = Number(action.amountText);
    const id = 'preview-payout-' + state.nextSequence;
    const reference = 'DEMO-MPESA-' + String(state.nextSequence).padStart(4, '0');
    return {
      ...state, available: state.available - amount, pendingPayouts: state.pendingPayouts + amount,
      payouts: [{ id, amount, phone: action.phone, status: 'Processing', createdAt: 'Oct 11, preview', reference }, ...state.payouts],
      transactions: [{ id: 'tx-' + id, date: 'Oct 11, preview', kind: 'Payout', title: 'M-PESA withdrawal (simulated)', amount: -amount, reference, status: 'Pending' }, ...state.transactions],
      payoutPhone: action.phone, nextSequence: state.nextSequence + 1,
      lastMessage: 'Mock payout request is processing. No money has been sent.',
    };
  }
  if (action.type === 'SIMULATE_PAYOUT_RESULT') {
    const payout = state.payouts.find(p => p.id === action.id);
    if (!payout || payout.status !== 'Processing') return { ...state, lastMessage: 'Only a processing demonstration payout can change state.' };
    return {
      ...state,
      available: action.result === 'Failed' ? state.available + payout.amount : state.available,
      pendingPayouts: state.pendingPayouts - payout.amount,
      payouts: state.payouts.map(p => p.id === action.id ? { ...p, status: action.result, reason: action.result === 'Failed' ? 'Simulated provider failure' : undefined } : p),
      transactions: state.transactions.map(tx => tx.reference === payout.reference ? { ...tx, status: action.result === 'Failed' ? 'Failed' : 'Completed' } : tx),
      lastMessage: action.result === 'Failed' ? 'Simulated payout failed; reserved amount returned to demo available balance.' : 'Simulated payout marked paid. No real M-PESA transfer occurred.',
    };
  }
  return state;
}
export const sampleMultiStops = [
  { id: 'pickup', number: 1, type: 'PICKUP', name: 'Burger Hub', place: 'Sarit Centre, Westlands', order: '#DR-78425', eta: '3 min', distance: '0.8 km' },
  { id: 'drop1', number: 2, type: 'DROP-OFF', name: 'Emily Wanjiru', place: 'Sunset Apartments, Kilimani', order: '#DR-78425', eta: '18 min', distance: '5.2 km' },
  { id: 'drop2', number: 3, type: 'DROP-OFF', name: 'James Mwangi', place: 'Riverside Drive, Westlands', order: '#DR-98412', eta: '32 min', distance: '6.4 km' },
] as const;
export function nextMultiStop(current: MockStopState): MockStopState {
  return (Math.min(3, current + 1)) as MockStopState;
}
export function routeSequenceValid(orderIds: readonly string[]): boolean {
  return orderIds.length === sampleMultiStops.length &&
    orderIds.every((id, i) => id === sampleMultiStops[i].id);
}
export function withdrawalSummary(wallet: WalletState) {
  return { available: wallet.available, pending: wallet.pendingPayouts, cashOwed: wallet.cashOutstanding, earned: wallet.totalEarned };
}
