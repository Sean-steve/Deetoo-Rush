/**
 * DeeToo Rider Phase 2: deterministic, frontend-only delivery demonstration.
 * A simulated order is NOT an authoritative order, dispatch, location or payment.
 */
export type DeliveryScreen = 'incoming' | 'details' | 'merchantRoute' | 'pickup' | 'customerRoute' | 'handover';
export type DeliveryStatus =
  | 'idle' | 'offered' | 'expired' | 'declined' | 'accepted'
  | 'navigating_merchant' | 'at_merchant' | 'picked_up'
  | 'navigating_customer' | 'at_customer' | 'delivered';
export type DeliveryIssueType =
  | 'Merchant delay' | 'Missing or damaged items' | 'Wrong pickup location'
  | 'Customer unavailable' | 'Incorrect address' | 'Vehicle breakdown' | 'Other';
export type DeliveryIssue = { type: DeliveryIssueType; description: string; stage: DeliveryScreen; acknowledged: boolean };
export type ProofMethod = 'otp' | 'photo';
export type DeliveryState = {
  screen: DeliveryScreen;
  status: DeliveryStatus;
  offerSeconds: number;
  itemCountConfirmed: boolean;
  pickupCodeVerified: boolean;
  photoStaged: boolean;
  issue: DeliveryIssue | null;
  info: string;
};
export const DEMO_PICKUP_CODE = '4621';
export const DEMO_HANDOVER_OTP = '638204';
export const OFFER_DURATION_SECONDS = 25;
export const demoOrder = {
  id: '#DR-78425',
  merchant: 'Burger Hub',
  branch: 'Sarit Centre, Westlands, Nairobi',
  merchantFloor: 'Shop LG-12',
  customer: 'Emily Wanjiru',
  customerAddress: 'Lenana Road, Kilimani, Nairobi',
  destination: 'Sunset Apartments • Block B • 3rd Floor • House B3',
  merchantManager: 'Brian Otieno',
  customerNote: 'Call when you arrive at the gate. Use the intercom; meet at reception.',
  merchantNote: 'Confirm the order number and count before leaving.',
  items: [
    { name: 'Beef Burger', quantity: 1, price: 450, icon: '🍔' },
    { name: 'Fries', quantity: 1, price: 200, icon: '🍟' },
    { name: 'Soda', quantity: 1, price: 120, icon: '🥤' },
  ],
  riderPayoutEstimate: 380, // not the order subtotal or authorized ledger amount
  pickupDistanceKm: 1.2,
  customerDistanceKm: 4.8,
  pickupEtaMinutes: 5,
  customerEtaMinutes: 23,
};
export const initialDeliveryState: DeliveryState = {
  screen: 'incoming',
  status: 'idle',
  offerSeconds: OFFER_DURATION_SECONDS,
  itemCountConfirmed: false,
  pickupCodeVerified: false,
  photoStaged: false,
  issue: null,
  info: '',
};
export type DeliveryAction =
  | { type: 'NEW_OFFER' }
  | { type: 'TICK' }
  | { type: 'DECLINE' }
  | { type: 'ACCEPT' }
  | { type: 'VIEW_DETAILS' }
  | { type: 'GO_TO_MERCHANT' }
  | { type: 'ARRIVE_MERCHANT' }
  | { type: 'SET_ITEMS_CONFIRMED'; value: boolean }
  | { type: 'VERIFY_PICKUP_CODE'; code: string }
  | { type: 'CONFIRM_PICKUP' }
  | { type: 'GO_TO_CUSTOMER' }
  | { type: 'ARRIVE_CUSTOMER' }
  | { type: 'STAGE_DELIVERY_PHOTO'; staged: boolean }
  | { type: 'COMPLETE_DELIVERY'; method: ProofMethod; otp: string }
  | { type: 'REPORT_ISSUE'; issue: DeliveryIssueType; description: string }
  | { type: 'CLEAR_INFO' }
  | { type: 'RESET' }
  | { type: 'DEMO_STAGE'; screen: DeliveryScreen };

export function validateDeliveryIssue(type: DeliveryIssueType | '', description: string): string | null {
  if (!type) return 'Select an incident category.';
  if (description.trim().length < 10) return 'Describe the problem in at least 10 characters.';
  return null;
}
export function canConfirmPickup(state: DeliveryState): boolean {
  return state.status === 'at_merchant' && state.itemCountConfirmed && state.pickupCodeVerified
    && state.issue === null;
}
export function canCompleteDelivery(state: DeliveryState, method: ProofMethod, otp: string): boolean {
  return state.status === 'at_customer' && state.issue === null
    && (method === 'otp' ? otp.trim() === DEMO_HANDOVER_OTP : state.photoStaged);
}

const stageState: Record<DeliveryScreen, DeliveryStatus> = {
  incoming: 'offered',
  details: 'accepted',
  merchantRoute: 'navigating_merchant',
  pickup: 'at_merchant',
  customerRoute: 'navigating_customer',
  handover: 'at_customer',
};
export function deliveryReducer(state: DeliveryState, action: DeliveryAction): DeliveryState {
  switch (action.type) {
    case 'RESET': return { ...initialDeliveryState };
    case 'NEW_OFFER':
      if (!['idle', 'expired', 'declined', 'delivered'].includes(state.status)) return state;
      return { ...initialDeliveryState, status: 'offered' };
    case 'TICK':
      if (state.status !== 'offered') return state;
      if (state.offerSeconds <= 1) return { ...state, status: 'expired', offerSeconds: 0, info: 'Offer expired. It is no longer available.' };
      return { ...state, offerSeconds: state.offerSeconds - 1 };
    case 'DECLINE':
      if (state.status !== 'offered') return state;
      return { ...state, status: 'declined', info: 'Offer declined in demo mode.' };
    case 'ACCEPT':
      if (state.status !== 'offered' || state.offerSeconds <= 0) return state;
      return { ...state, status: 'accepted', screen: 'details', info: 'Delivery accepted in mock mode.' };
    case 'VIEW_DETAILS':
      if (!['accepted', 'navigating_merchant', 'at_merchant'].includes(state.status)) return state;
      return { ...state, screen: 'details', info: '' };
    case 'GO_TO_MERCHANT':
      if (!['accepted', 'navigating_merchant'].includes(state.status)) return state;
      return { ...state, screen: 'merchantRoute', status: 'navigating_merchant', info: '' };
    case 'ARRIVE_MERCHANT':
      if (state.status !== 'navigating_merchant') return state;
      return { ...state, screen: 'pickup', status: 'at_merchant', info: 'Arrived at Burger Hub (simulated).' };
    case 'SET_ITEMS_CONFIRMED':
      return state.status === 'at_merchant' ? { ...state, itemCountConfirmed: action.value, info: '' } : state;
    case 'VERIFY_PICKUP_CODE':
      if (state.status !== 'at_merchant') return state;
      return {
        ...state, pickupCodeVerified: action.code.trim() === DEMO_PICKUP_CODE,
        info: action.code.trim() === DEMO_PICKUP_CODE ? 'Order reference verified (mock).' : 'Incorrect demo pickup code.',
      };
    case 'CONFIRM_PICKUP':
      if (!canConfirmPickup(state)) return { ...state, info: 'Confirm every item and verify the pickup reference before leaving.' };
      return { ...state, status: 'picked_up', screen: 'customerRoute', info: 'Order collected. Ready to navigate to the customer.' };
    case 'GO_TO_CUSTOMER':
      if (!['picked_up', 'navigating_customer'].includes(state.status)) return state;
      return { ...state, screen: 'customerRoute', status: 'navigating_customer', info: '' };
    case 'ARRIVE_CUSTOMER':
      if (!['picked_up', 'navigating_customer'].includes(state.status)) return state;
      return { ...state, screen: 'handover', status: 'at_customer', info: 'Customer arrival confirmed (mock).' };
    case 'STAGE_DELIVERY_PHOTO':
      return state.status === 'at_customer' ? { ...state, photoStaged: action.staged, info: '' } : state;
    case 'COMPLETE_DELIVERY':
      if (state.issue) {
        return { ...state, info: 'An unresolved incident is attached. Dispatch/support review is required before completing.' };
      }
      if (!canCompleteDelivery(state, action.method, action.otp)) {
        return { ...state, info: action.method === 'otp' ? 'Enter the valid six-digit demo customer PIN.' : 'Stage the approved demonstration proof photo first.' };
      }
      return { ...state, status: 'delivered', info: 'Delivery completed in this frontend preview only.' };
    case 'REPORT_ISSUE': {
      if (state.issue) {
        return { ...state, info: 'A report already awaits review. Riders cannot replace or clear unresolved incidents.' };
      }
      const error = validateDeliveryIssue(action.issue, action.description);
      if (error || ['delivered', 'idle', 'expired', 'declined', 'offered'].includes(state.status)) {
        return { ...state, info: error || 'An active delivery is needed to report an issue.' };
      }
      return {
        ...state,
        issue: { type: action.issue, description: action.description.trim(), stage: state.screen, acknowledged: false },
        info: 'Issue recorded locally for review. No support case has been created.',
      };
    }
    case 'CLEAR_INFO': return { ...state, info: '' };
    case 'DEMO_STAGE': {
      // Explicit design-review shortcuts; not an operational transition or persisted fact.
      const nextStatus = stageState[action.screen];
      return {
        ...initialDeliveryState,
        status: nextStatus, screen: action.screen,
        itemCountConfirmed: ['customerRoute', 'handover'].includes(action.screen),
        pickupCodeVerified: ['customerRoute', 'handover'].includes(action.screen),
        info: 'Visual review preset loaded. No actual delivery state changed.',
      };
    }
    default: return state;
  }
}
export function activeDeliveryStatus(status: DeliveryStatus): boolean {
  return ['accepted', 'navigating_merchant', 'at_merchant', 'picked_up', 'navigating_customer', 'at_customer'].includes(status);
}
