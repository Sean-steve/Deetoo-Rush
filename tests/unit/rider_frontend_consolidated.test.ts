import assert from 'node:assert/strict';
import test from 'node:test';
import { riderScreenCatalog, riderScreenById, riderTabs } from '../../apps/rider-android/src/preview/screen-catalog';
import { shouldUseRiderFrontendMock } from '../../apps/rider-android/src/preview/preview-mode';
import { initialSafety, initialSupport, safetyReducer, supportReducer } from '../../apps/rider-android/src/preview/phase4-model';

test('Every approved Rider design has one unique screen identifier and implementation', () => {
  assert.equal(riderScreenCatalog.length, 24);
  assert.deepEqual(riderScreenCatalog.map(s => s.id), Array.from({ length: 24 }, (_, i) => i + 1));
  assert.equal(new Set(riderScreenCatalog.map(s => s.title)).size, 24);
  assert.equal(new Set(riderScreenCatalog.map(s => s.implementation)).size, 24);
  for (const phase of [1, 2, 3, 4] as const) {
    assert.equal(riderScreenCatalog.filter(s => s.phase === phase).length, 6);
  }
  assert.equal(riderScreenById(24)?.title, 'Rider Profile & Settings');
  assert.equal(riderScreenById(25), undefined);
});

test('Exactly five approved bottom tabs cover all post-login screens', () => {
  assert.deepEqual(riderTabs, ['Home', 'Deliveries', 'Earnings', 'Inbox', 'Profile']);
  assert.deepEqual(riderScreenCatalog.slice(0, 5).map(s => s.tab), [null, null, null, null, null]);
  for (const entry of riderScreenCatalog.slice(5)) {
    assert.ok(entry.tab && riderTabs.includes(entry.tab), 'Missing approved tab on screen ' + entry.id);
  }
  assert.equal(riderScreenById(6)?.tab, 'Home');
  assert.equal(riderScreenById(20)?.tab, 'Inbox');
  assert.equal(riderScreenById(23)?.tab, 'Profile');
});

test('The 24-screen frontend cannot mount in production or without explicit opt in', () => {
  assert.equal(shouldUseRiderFrontendMock(true, 'mock'), true);
  assert.equal(shouldUseRiderFrontendMock(false, 'mock'), false);
  assert.equal(shouldUseRiderFrontendMock(true, undefined), false);
  assert.equal(shouldUseRiderFrontendMock(true, 'live'), false);
  assert.equal(shouldUseRiderFrontendMock(false, undefined), false);
});

test('Rider-domain demo reducers expose no administrator resolution actions', () => {
  const selected = supportReducer(initialSupport, { type: 'SELECT', id: 'SUP-78432' });
  const riderFeedback = supportReducer(selected, { type: 'SATISFACTION', satisfied: true });
  assert.equal(riderFeedback.cases.find(c => c.id === 'SUP-78432')?.status, 'In Progress');
  assert.deepEqual(safetyReducer(initialSafety, { type: 'RESET' }).incidents.map(i => i.status), ['Investigating', 'Resolved']);
});
