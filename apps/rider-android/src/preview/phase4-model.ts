/**
 * Rider Phase 4 demo state. Strictly frontend-only: no message, incident,
 * identity, administrative resolution, emergency call or deletion is sent.
 */
export type InboxCategory = 'All' | 'Orders' | 'Earnings' | 'Account' | 'Support' | 'Updates';
export type NotificationKind = Exclude<InboxCategory, 'All'>;
export type RiderNotice = {
  id: string; kind: NotificationKind; title: string; body: string; time: string;
  read: boolean; critical: boolean; target?: 'support' | 'safety' | 'payouts' | 'deliveries' | 'profile';
};
export const initialNotifications: RiderNotice[] = [
  { id: 'n1', kind: 'Orders', title: 'New delivery request', body: 'An example pickup is available near Westlands.', time: '10:24', read: false, critical: true, target: 'deliveries' },
  { id: 'n2', kind: 'Earnings', title: 'Payout successful', body: 'Sample KSh 5,000 payout marked completed.', time: '09:18', read: false, critical: false, target: 'payouts' },
  { id: 'n3', kind: 'Updates', title: 'Great job!', body: 'You maintained an excellent on-time delivery trend.', time: '08:42', read: false, critical: false },
  { id: 'n4', kind: 'Support', title: 'New support message', body: 'The payments team replied to your sample case.', time: '07:56', read: false, critical: false, target: 'support' },
  { id: 'n5', kind: 'Orders', title: 'Order delivered', body: 'Demo order #DR-78425 completed.', time: 'Yesterday', read: false, critical: false, target: 'deliveries' },
  { id: 'n6', kind: 'Account', title: 'Document reminder', body: 'Review your licence expiry date.', time: 'Yesterday', read: false, critical: true, target: 'profile' },
  { id: 'n7', kind: 'Updates', title: 'Service-zone update', body: 'Roadworks around Westlands may affect travel.', time: 'Oct 09', read: true, critical: true, target: 'safety' },
  { id: 'n8', kind: 'Support', title: 'Case status updated', body: 'Your mock case entered investigation.', time: 'Oct 08', read: true, critical: false, target: 'support' },
];
export type NotificationPreferences = {
  delivery: boolean; payouts: boolean; account: boolean; support: boolean;
  promotions: boolean; updates: boolean;
};
export const defaultNotificationPreferences: NotificationPreferences = {
  delivery: true, payouts: true, account: true, support: true, promotions: false, updates: true,
};
export type SupportStatus = 'Open' | 'In Progress' | 'Waiting for Rider' | 'Resolved';
export type SupportCategory = 'Orders & Deliveries' | 'Earnings & Payouts' | 'Account & Profile' | 'App & Technical' | 'Safety & Security' | 'Equipment & Gear' | 'Other';
export const supportCategories: SupportCategory[] = ['Orders & Deliveries', 'Earnings & Payouts', 'Account & Profile', 'App & Technical', 'Safety & Security', 'Equipment & Gear', 'Other'];
export type SupportMessage = { id: string; sender: 'Rider' | 'Support' | 'System'; body: string; time: string; attachments: string[] };
export type SupportCase = {
  id: string; subject: string; category: SupportCategory; status: SupportStatus;
  orderId?: string; priority: 'Normal' | 'High'; updatedAt: string;
  messages: SupportMessage[]; riderSatisfied: boolean | null; followupRequested: boolean;
};
export const initialCases: SupportCase[] = [
  {
    id: 'SUP-78432', subject: 'Missing delivery payment', category: 'Earnings & Payouts',
    status: 'In Progress', orderId: '#DR-78425', priority: 'Normal', updatedAt: 'Oct 11, 14:20',
    riderSatisfied: null, followupRequested: false, messages: [
      { id: 'm1', sender: 'Rider', body: 'I completed order #DR-78425, but the payment is not in my earnings.', time: '10:24', attachments: ['demo-delivery-confirmation.jpg'] },
      { id: 'm2', sender: 'Support', body: 'Thank you. We have raised the order with the payments team for verification.', time: '10:32', attachments: [] },
      { id: 'm3', sender: 'System', body: 'Case escalated to the payments team. Awaiting investigation.', time: '11:15', attachments: [] },
      { id: 'm4', sender: 'Support', body: 'The mock payment is now visible in your wallet preview. Please confirm whether your issue is addressed.', time: '14:20', attachments: [] },
    ],
  },
  {
    id: 'SUP-78410', subject: 'App not showing orders', category: 'App & Technical',
    status: 'Open', priority: 'Normal', updatedAt: 'Oct 10, 17:05', riderSatisfied: null, followupRequested: false,
    messages: [{ id: 'm5', sender: 'Rider', body: 'My app is not receiving delivery offers.', time: '17:05', attachments: [] }],
  },
  {
    id: 'SUP-78391', subject: 'Unsafe drop-off location', category: 'Safety & Security',
    status: 'Resolved', orderId: '#DR-78420', priority: 'High', updatedAt: 'Oct 08, 12:30', riderSatisfied: null, followupRequested: false,
    messages: [
      { id: 'm6', sender: 'Rider', body: 'I felt unsafe at the delivery location.', time: '10:40', attachments: [] },
      { id: 'm7', sender: 'Support', body: 'An administrator reviewed the case and closed it. Tell us if you need more help.', time: '12:30', attachments: [] },
    ],
  },
];
export type SupportState = { cases: SupportCase[]; selectedId: string | null; sequence: number; info: string };
export const initialSupport: SupportState = { cases: initialCases, selectedId: 'SUP-78432', sequence: 1, info: '' };
export type SupportAction =
  | { type: 'SELECT'; id: string }
  | { type: 'CREATE'; subject: string; category: SupportCategory; description: string; orderId?: string }
  | { type: 'REPLY'; body: string; attachment?: string }
  | { type: 'ATTACH'; filename: string }
  | { type: 'SATISFACTION'; satisfied: boolean }
  | { type: 'FOLLOW_UP'; note: string }
  | { type: 'CLEAR_INFO' }
  | { type: 'RESET' };
const safeOrderIds = ['#DR-78425', '#DR-78424', '#DR-78423', '#DR-78420'];
export function validateSupportCase(subject: string, description: string, orderId?: string): string | null {
  if (subject.trim().length < 5) return 'Enter a subject of at least five characters.';
  if (description.trim().length < 10) return 'Describe your issue in at least ten characters.';
  if (orderId && !safeOrderIds.includes(orderId)) return 'Select an order from your verified demo history.';
  return null;
}
export function supportReducer(state: SupportState, action: SupportAction): SupportState {
  if (action.type === 'RESET') return { ...initialSupport, cases: initialCases.map(c => ({ ...c, messages: c.messages.map(m => ({ ...m, attachments: [...m.attachments] })) })) };
  if (action.type === 'SELECT') return state.cases.some(c => c.id === action.id) ? { ...state, selectedId: action.id, info: '' } : state;
  if (action.type === 'CLEAR_INFO') return { ...state, info: '' };
  if (action.type === 'CREATE') {
    const error = validateSupportCase(action.subject, action.description, action.orderId);
    if (error) return { ...state, info: error };
    const id = 'DEMO-SUP-' + String(state.sequence).padStart(4, '0');
    const created: SupportCase = {
      id, subject: action.subject.trim(), category: action.category, orderId: action.orderId,
      status: 'Open', priority: action.category === 'Safety & Security' ? 'High' : 'Normal',
      updatedAt: 'Preview • now', riderSatisfied: null, followupRequested: false,
      messages: [{ id: id + '-message', sender: 'Rider', body: action.description.trim(), time: 'Preview • now', attachments: [] }],
    };
    return { cases: [created, ...state.cases], selectedId: id, sequence: state.sequence + 1, info: 'Support case created locally. No ticket was sent.' };
  }
  const selected = state.cases.find(c => c.id === state.selectedId);
  if (!selected) return { ...state, info: 'Choose a support conversation.' };
  if (action.type === 'REPLY') {
    if (action.body.trim().length < 1) return { ...state, info: 'Write a message before sending.' };
    if (selected.status === 'Resolved') return { ...state, info: 'Request a follow-up to reopen this simulated case before replying.' };
    if (action.attachment && !selected.messages.some(m => m.attachments.includes(action.attachment!))) {
      // Stage filename on the outgoing message; no file is read or transmitted.
    }
    return { ...state, cases: state.cases.map(c => c.id === selected.id ? {
      ...c, updatedAt: 'Preview • now',
      messages: [...c.messages, { id: selected.id + '-reply-' + (c.messages.length + 1), sender: 'Rider', body: action.body.trim(), time: 'Preview • now', attachments: action.attachment ? [action.attachment] : [] }],
    } : c), info: 'Message saved to the preview conversation only.' };
  }
  if (action.type === 'ATTACH') return { ...state, info: 'Attachment names are staged locally only; no file was uploaded.' };
  if (action.type === 'SATISFACTION') return {
    ...state, cases: state.cases.map(c => c.id === selected.id ? { ...c, riderSatisfied: action.satisfied } : c),
    info: action.satisfied ? 'Satisfaction noted. Only authorized admins resolve cases.' : 'Not satisfied: use Request Follow-up to ask for further review.',
  };
  if (action.type === 'FOLLOW_UP') {
    if (action.note.trim().length < 10) return { ...state, info: 'Add at least 10 characters explaining why you need more help.' };
    return { ...state, cases: state.cases.map(c => c.id === selected.id ? {
      ...c, followupRequested: true, riderSatisfied: false, status: 'Open', updatedAt: 'Preview • now',
      messages: [...c.messages, { id: c.id + '-followup-' + (c.messages.length + 1), sender: 'Rider', body: 'Follow-up requested: ' + action.note.trim(), time: 'Preview • now', attachments: [] }],
    } : c), info: 'Rider follow-up request submitted to the local preview.' };
  }
  return state;
}
export type IncidentType = 'Accident' | 'Vehicle breakdown' | 'Unsafe location' | 'Harassment' | 'Other';
export type IncidentStatus = 'Submitted' | 'Acknowledged' | 'Investigating' | 'Resolved';
export type Incident = {
  id: string; type: IncidentType; details: string; location: string;
  time: string; evidence: string[]; status: IncidentStatus; orderId?: string;
};
export type SafetyState = { incidents: Incident[]; sequence: number; info: string };
export const initialSafety: SafetyState = {
  incidents: [
    { id: 'INC-78432', type: 'Accident', details: 'Minor traffic incident near Westlands; no injury reported.', location: 'Westlands, Nairobi', time: 'Oct 09, 14:18', evidence: [], status: 'Investigating' },
    { id: 'INC-78104', type: 'Vehicle breakdown', details: 'Mechanical issue while off shift.', location: 'Ngong Road, Nairobi', time: 'Oct 05, 11:45', evidence: [], status: 'Resolved' },
  ], sequence: 1, info: '',
};
export type SafetyAction =
  | { type: 'REPORT'; issueType: IncidentType; details: string; location: string; evidence: string[]; orderId?: string }
  | { type: 'RESET' };
export function validateIncident(issueType: IncidentType | '', description: string, location: string): string | null {
  if (!issueType) return 'Choose an incident category.';
  if (description.trim().length < 15) return 'Provide at least 15 characters describing the incident.';
  if (location.trim().length < 3) return 'Enter a location or nearby landmark.';
  return null;
}
export function safetyReducer(state: SafetyState, action: SafetyAction): SafetyState {
  if (action.type === 'RESET') return { ...initialSafety, incidents: initialSafety.incidents.map(x => ({ ...x })) };
  if (action.type === 'REPORT') {
    const error = validateIncident(action.issueType, action.details, action.location);
    if (error) return { ...state, info: error };
    const incident: Incident = {
      id: 'DEMO-INC-' + String(state.sequence).padStart(4, '0'),
      type: action.issueType, details: action.details.trim(), location: action.location.trim(),
      evidence: [...action.evidence], orderId: action.orderId,
      status: 'Submitted', time: 'Preview • now',
    };
    return { ...state, incidents: [incident, ...state.incidents], sequence: state.sequence + 1, info: 'Incident saved in preview only. No emergency or administrator was notified.' };
  }
  return state;
}
export type ProfileSection = 'overview' | 'personal' | 'vehicle' | 'documents' | 'payout' | 'security' | 'notifications' | 'preferences' | 'account';
export type RiderPreviewProfile = {
  name: string; phone: string; email: string; address: string; emergencyContact: string;
  vehicle: string; plate: string; accountStatus: 'Verified' | 'Reverification required';
  payoutPhone: string; twoFactor: boolean; biometric: boolean;
  language: 'English' | 'Kiswahili'; mapStyle: 'Standard' | 'Satellite';
  sounds: boolean; vibration: boolean; darkMode: boolean;
  deactivationRequested: boolean; deletionRequested: boolean;
};
export const initialProfile: RiderPreviewProfile = {
  name: 'John Kamau', phone: '0712345678', email: 'john.kamau@example.com',
  address: 'Westlands, Nairobi', emergencyContact: 'Jane Kamau · 0723456789',
  vehicle: 'Bajaj Boxer 150', plate: 'KMC 235A', accountStatus: 'Verified',
  payoutPhone: '0712345678', twoFactor: true, biometric: false,
  language: 'English', mapStyle: 'Standard', sounds: true, vibration: true,
  darkMode: false, deactivationRequested: false, deletionRequested: false,
};
export type ProfileAction =
  | { type: 'EDIT_PERSONAL'; name: string; email: string; address: string }
  | { type: 'EDIT_VEHICLE'; vehicle: string; plate: string }
  | { type: 'EDIT_PAYOUT'; phone: string }
  | { type: 'TOGGLE'; key: 'twoFactor' | 'biometric' | 'sounds' | 'vibration' | 'darkMode' }
  | { type: 'LANGUAGE'; value: RiderPreviewProfile['language'] }
  | { type: 'MAP_STYLE'; value: RiderPreviewProfile['mapStyle'] }
  | { type: 'REQUEST_DEACTIVATION' }
  | { type: 'REQUEST_DELETION' }
  | { type: 'RESET' };
export function profileReducer(state: RiderPreviewProfile, action: ProfileAction): RiderPreviewProfile {
  if (action.type === 'RESET') return { ...initialProfile };
  if (action.type === 'EDIT_PERSONAL') {
    if (action.name.trim().length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(action.email.trim())) return state;
    return { ...state, name: action.name.trim(), email: action.email.trim(), address: action.address.trim(), accountStatus: 'Reverification required' };
  }
  if (action.type === 'EDIT_VEHICLE') {
    if (!action.vehicle.trim() || !action.plate.trim()) return state;
    return { ...state, vehicle: action.vehicle.trim(), plate: action.plate.trim(), accountStatus: 'Reverification required' };
  }
  if (action.type === 'EDIT_PAYOUT') {
    if (!validKenyanPhone(action.phone)) return state;
    return { ...state, payoutPhone: action.phone, accountStatus: 'Reverification required' };
  }
  if (action.type === 'TOGGLE') return { ...state, [action.key]: !state[action.key] };
  if (action.type === 'LANGUAGE') return { ...state, language: action.value };
  if (action.type === 'MAP_STYLE') return { ...state, mapStyle: action.value };
  if (action.type === 'REQUEST_DEACTIVATION') return { ...state, deactivationRequested: true };
  if (action.type === 'REQUEST_DELETION') return { ...state, deletionRequested: true };
  return state;
}
import { validKenyanPhone } from './phase1-model';
