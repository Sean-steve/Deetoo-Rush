/**
 * Compilation-level screen coverage guard. This is not a substitute for a
 * physical Android device pixel comparison or accessibility audit.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { riderScreenCatalog, riderTabs } from '../../apps/rider-android/src/preview/screen-catalog';
const connected=readFileSync('apps/rider-android/src/connected/RiderConnectedApp.tsx','utf8');
const entry=readFileSync('apps/rider-android/App.tsx','utf8');
const api=readFileSync('apps/rider-android/src/connected/rider-backend.ts','utf8');
const media=readFileSync('apps/rider-android/src/connected/media.ts','utf8');

test('Phase 5: every approved screen has a connected route',()=>{
  assert.equal(riderScreenCatalog.length,24);
  assert.match(connected,/!user\s*&&\s*view===1/);
  assert.match(connected,/!user\s*&&\s*view===2/);
  const cases=new Set([...connected.matchAll(/\bcase\s+(\d+)\s*:/g)].map(v=>Number(v[1])));
  for(let i=3;i<=24;i++) assert.ok(cases.has(i),'Connected screen '+i+' is missing');
  assert.deepEqual(riderTabs,['Home','Deliveries','Earnings','Inbox','Profile']);
  assert.match(connected,/const applyTab/);
  assert.match(connected,/activeTab=\{user\?tab:undefined\}/);
});

test('Phase 5: Android production default mounts connected app; mocks and legacy only in development',()=>{
  assert.match(entry,/__DEV__\s*&&\s*process\.env\.EXPO_PUBLIC_RIDER_UI_MODE === 'legacy'/);
  assert.match(entry,/shouldUseRiderFrontendMock\(__DEV__,\s*process\.env\.EXPO_PUBLIC_RIDER_UI_MODE\)/);
  assert.match(entry,/mock \? <RiderFrontendApp \/> : legacy \? <RiderNativeApp \/> : <RiderConnectedApp \/>/);
});

test('Phase 5: connected paths do not expose fake OTP, support closure or Finance execution',()=>{
  assert.doesNotMatch(connected, /123456|DEMO_HANDOVER_OTP|DEMO_PICKUP_CODE|SIMULATE admin|Mark as Resolved/);
  assert.doesNotMatch(api,/['"]\/admin\/|['"]\/finance\/|\/resolve-case|\/finalize/);
  assert.match(connected,/api\.confirmPickup/);
  assert.match(connected,/api\.completeOtp/);
  assert.match(connected,/uploadDeliveryPhoto/);
  assert.match(connected,/api\.completePhoto/);
  assert.match(connected,/api\.changeRequest/);
  assert.match(connected,/api\.requestWithdrawal/);
  assert.match(connected,/api\.respondSupport/);
  assert.match(connected,/api\.createIncident/);
});

test('Phase 5: the real media pipeline verifies image bytes and binds uploaded media IDs',()=>{
  for(const check of [/fetch\(uri\)/,/\/media\/uploads/,/method:'PUT'/,/\/complete/,/return intent\.media_id/])
    assert.match(media,check);
  assert.match(connected,/await uploadRiderImage/);
  assert.match(connected,/await api\.submitDocument\(mediaId/);
  assert.match(connected,/await api\.incidentEvidence\(job\.ref/);
  assert.match(connected,/await api\.sendSupportMessage\(job\.ref/);
});
