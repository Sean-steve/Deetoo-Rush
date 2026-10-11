import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultNotificationPreferences, initialCases, initialNotifications,
  initialProfile, initialSafety, initialSupport, profileReducer, safetyReducer,
  supportReducer, validateIncident, validateSupportCase,
} from '../../apps/rider-android/src/preview/phase4-model';

test('Notifications include all categories with essential flags and unread states', () => {
  assert.equal(initialNotifications.filter(n => !n.read).length, 6);
  assert.equal(initialNotifications.some(n => n.kind === 'Support' && n.target === 'support'), true);
  assert.equal(initialNotifications.some(n => n.critical && n.kind === 'Account'), true);
  assert.equal(defaultNotificationPreferences.delivery, true);
  assert.equal(defaultNotificationPreferences.account, true);
});

test('New support cases require a subject, description and valid linked order', () => {
  assert.match(validateSupportCase('bad', 'The rider has a payment issue') || '', /subject/);
  assert.match(validateSupportCase('Rider payout', 'short') || '', /ten/);
  assert.match(validateSupportCase('Rider payout', 'The order payout is missing', '#OTHER') || '', /verified/);
  assert.equal(validateSupportCase('Rider payout', 'The order payout is missing', '#DR-78425'), null);
  const created = supportReducer(initialSupport, {
    type: 'CREATE', subject: 'Missing payment', category: 'Earnings & Payouts',
    description: 'My completed order is not paid out', orderId: '#DR-78425',
  });
  assert.equal(created.cases.length, initialCases.length + 1);
  assert.equal(created.cases[0].status, 'Open');
  assert.equal(created.cases[0].orderId, '#DR-78425');
  assert.match(created.cases[0].id, /^DEMO-SUP-/);
  assert.equal(initialSupport.cases.length, initialCases.length);
});

test('Support conversation retains messages and staging attachment names is not a file upload', () => {
  let state = supportReducer(initialSupport, { type: 'SELECT', id: 'SUP-78432' });
  const before = state.cases.find(c => c.id === 'SUP-78432')!.messages.length;
  state = supportReducer(state, { type: 'REPLY', body: 'Please check the payout for this order', attachment: 'mock-screenshot.jpg' });
  const messages = state.cases.find(c => c.id === 'SUP-78432')!.messages;
  assert.equal(messages.length, before + 1);
  assert.equal(messages.at(-1)?.sender, 'Rider');
  assert.deepEqual(messages.at(-1)?.attachments, ['mock-screenshot.jpg']);
  assert.equal(initialSupport.cases.find(c => c.id === 'SUP-78432')!.messages.length, before);
});

test('Rider satisfaction never resolves a support case', () => {
  let state = supportReducer(initialSupport, { type: 'SELECT', id: 'SUP-78432' });
  state = supportReducer(state, { type: 'SATISFACTION', satisfied: true });
  const c = state.cases.find(v => v.id === 'SUP-78432')!;
  assert.equal(c.riderSatisfied, true);
  assert.equal(c.status, 'In Progress');
  state = supportReducer(state, { type: 'FOLLOW_UP', note: 'The wallet still does not show the correct amount' });
  const followup = state.cases.find(v => v.id === 'SUP-78432')!;
  assert.equal(followup.status, 'Open');
  assert.equal(followup.followupRequested, true);
  assert.equal(followup.riderSatisfied, false);
  assert.match(followup.messages.at(-1)!.body, /Follow-up requested/);
});

test('Resolved support cases can request follow-up without erasing conversation history', () => {
  let state = supportReducer(initialSupport, { type: 'SELECT', id: 'SUP-78391' });
  const initialMessageCount = state.cases.find(c => c.id === 'SUP-78391')!.messages.length;
  state = supportReducer(state, { type: 'REPLY', body: 'Should not send without a follow-up request' });
  assert.match(state.info, /follow-up/);
  assert.equal(state.cases.find(c => c.id === 'SUP-78391')!.messages.length, initialMessageCount);
  state = supportReducer(state, { type: 'FOLLOW_UP', note: 'I still have concerns about the delivery address' });
  const reopened = state.cases.find(c => c.id === 'SUP-78391')!;
  assert.equal(reopened.status, 'Open');
  assert.equal(reopened.messages.length, initialMessageCount + 1);
});

test('Support reset restores independent deep-cloned conversation fixture data', () => {
  const reset = supportReducer(initialSupport, { type: 'RESET' });
  assert.deepEqual(reset.cases, initialCases);
  assert.notEqual(reset.cases[0], initialCases[0]);
  assert.notEqual(reset.cases[0].messages[0], initialCases[0].messages[0]);
});

test('Safety reports enforce category, detail, location and retain evidence filenames', () => {
  assert.match(validateIncident('', 'Delivery near Westlands with concern', 'Westlands') || '', /category/);
  assert.match(validateIncident('Accident', 'short', 'Westlands') || '', /15/);
  assert.match(validateIncident('Accident', 'A collision happened near the junction', 'X') || '', /location/);
  assert.equal(validateIncident('Accident', 'A collision happened near the junction', 'Westlands'), null);
  const saved = safetyReducer(initialSafety, {
    type: 'REPORT', issueType: 'Vehicle breakdown',
    details: 'Motorcycle stalled along the roadside', location: 'Ngong Road',
    evidence: ['demo-incident.jpg'], orderId: '#DR-78425',
  });
  assert.equal(saved.incidents.length, initialSafety.incidents.length + 1);
  assert.equal(saved.incidents[0].status, 'Submitted');
  assert.deepEqual(saved.incidents[0].evidence, ['demo-incident.jpg']);
  assert.equal(saved.incidents[0].orderId, '#DR-78425');
  assert.equal(initialSafety.incidents.length, 2);
});

test('Rider incident reports do not acknowledge, investigate or resolve themselves', () => {
  const created = safetyReducer(initialSafety, {
    type: 'REPORT', issueType: 'Harassment',
    details: 'Someone threatened the rider near a delivery gate',
    location: 'Kilimani',
    evidence: [],
  });
  assert.equal(created.incidents[0].status, 'Submitted');
  const simulatedAdmin = safetyReducer(created, { type: 'PREVIEW_ADMIN_UPDATE', id: created.incidents[0].id, status: 'Investigating' });
  assert.equal(simulatedAdmin.incidents[0].status, 'Investigating');
  assert.equal(simulatedAdmin.info.includes('Simulated admin'), true);
});

test('Verified-profile corrections and payout phone changes enter reverification', () => {
  const edited = profileReducer(initialProfile, {
    type: 'EDIT_PERSONAL', name: 'John A. Kamau', email: 'john@example.com', address: 'Nairobi',
  });
  assert.equal(edited.accountStatus, 'Reverification required');
  assert.equal(edited.name, 'John A. Kamau');
  const changedVehicle = profileReducer(initialProfile, { type: 'EDIT_VEHICLE', vehicle: 'Bajaj Boxer', plate: 'KMC 235A' });
  assert.equal(changedVehicle.accountStatus, 'Reverification required');
  const payout = profileReducer(initialProfile, { type: 'EDIT_PAYOUT', phone: '+254712345678' });
  assert.equal(payout.payoutPhone, '+254712345678');
  assert.equal(payout.accountStatus, 'Reverification required');
  const invalid = profileReducer(initialProfile, { type: 'EDIT_PAYOUT', phone: 'fake-number' });
  assert.equal(invalid.payoutPhone, initialProfile.payoutPhone);
});

test('Rider account settings keep deletion as a request, never delete profile data', () => {
  const toggled = profileReducer(initialProfile, { type: 'TOGGLE', key: 'biometric' });
  assert.equal(toggled.biometric, true);
  const deactivation = profileReducer(initialProfile, { type: 'REQUEST_DEACTIVATION' });
  assert.equal(deactivation.deactivationRequested, true);
  assert.equal(deactivation.name, initialProfile.name);
  const deletion = profileReducer(deactivation, { type: 'REQUEST_DELETION' });
  assert.equal(deletion.deletionRequested, true);
  assert.equal(deletion.payoutPhone, initialProfile.payoutPhone);
  assert.equal(profileReducer(deletion, { type: 'RESET' }).deletionRequested, false);
});
