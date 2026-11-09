import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  COOKIE_POLICY_VERSION, COOKIE_RECEIPT_NAME, COOKIE_RECEIPT_DAYS,
  DEFAULT_COOKIE_PREFERENCES, canUseCookiePurpose, effectivePreferences,
  parseConsentReceipt, readCookieReceipt, runWithCookieConsent, saveCookiePreferences,
} from '../../packages/privacy/src/consent';
import {privacyReceiptSchema} from '../../apps/api/src/modules/auth/privacy-consent.service';

function sample(overrides:Record<string,unknown>={}){
  return {
    receiptId:'c27b20ef-7515-4088-bcd2-84820d4fbb76',version:COOKIE_POLICY_VERSION,
    recordedAt:'2026-11-09T08:00:00.000Z',expiresAt:'2027-01-09T08:00:00.000Z',source:'banner',
    preferences:{functional:false,analytics:false,marketing:false},...overrides,
  };
}
const NOW=Date.parse('2026-11-09T12:00:00.000Z');

test('all nonessential purposes are off by default, including prior to a choice',()=>{
  assert.deepEqual(DEFAULT_COOKIE_PREFERENCES,{functional:false,analytics:false,marketing:false});
  assert.equal(parseConsentReceipt(null,NOW),null);
  assert.equal(parseConsentReceipt('not-json',NOW),null);
});
test('a valid current consent receipt is parsed without granting additional purposes',()=>{
  const current=parseConsentReceipt(JSON.stringify(sample()),NOW);
  assert.ok(current);
  assert.deepEqual(current.preferences,{functional:false,analytics:false,marketing:false});
  assert.equal(current.version,COOKIE_POLICY_VERSION);
});
test('old, expired, malformed or non-boolean preferences require fresh consent',()=>{
  for(const changed of [
    {version:'2025-01-01'}, {expiresAt:'2025-01-01T00:00:00.000Z'},
    {preferences:{functional:false,analytics:'true',marketing:false}},
    {receiptId:'not-a-uuid'}, {recordedAt:'not-a-date'},
    {source:'admin'}, {preferences:{functional:true,analytics:true}},
  ]){
    assert.equal(parseConsentReceipt(JSON.stringify(sample(changed)),NOW),null);
  }
});
test('Global Privacy Control blocks analytics and marketing regardless of stored selection',()=>{
  const value={functional:true,analytics:true,marketing:true};
  assert.deepEqual(effectivePreferences(value,true),{functional:true,analytics:false,marketing:false});
  assert.deepEqual(effectivePreferences(value,false),value);
});
test('authenticated server receipt rejects stale policy, invalid categories and missing id',()=>{
  const valid=sample();
  assert.equal(privacyReceiptSchema.safeParse(valid).success,true);
  assert.equal(privacyReceiptSchema.safeParse(sample({version:'2023-01-01'})).success,false);
  assert.equal(privacyReceiptSchema.safeParse(sample({preferences:{functional:true,analytics:null,marketing:false}})).success,false);
  assert.equal(privacyReceiptSchema.safeParse(sample({receiptId:'other-user'})).success,false);
});

test('browser cookie uses host-only, SameSite=Lax, and explicit 180-day expiry',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  const windowDescriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
  const locationDescriptor=Object.getOwnPropertyDescriptor(globalThis,'location');
  const cookieJar:{cookie:string}={cookie:''};
  const eventNames:string[]=[];
  try {
    Object.defineProperty(globalThis,'document',{configurable:true,value:cookieJar});
    Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:(event:Event)=>{eventNames.push(event.type);return true;}}});
    Object.defineProperty(globalThis,'location',{configurable:true,value:{protocol:'https:'}});
    assert.equal(canUseCookiePurpose('analytics'),false);
    let started=0;
    assert.equal(runWithCookieConsent('marketing',()=>{started++;}),false);
    assert.equal(started,0);
    const recorded=saveCookiePreferences({functional:true,analytics:true,marketing:false},'customize',NOW);
    assert.ok(cookieJar.cookie.startsWith(COOKIE_RECEIPT_NAME+'='));
    assert.ok(cookieJar.cookie.includes('; Path=/; SameSite=Lax; Secure'));
    assert.ok(cookieJar.cookie.includes('Max-Age='+COOKIE_RECEIPT_DAYS*86400));
    assert.equal(cookieJar.cookie.includes('Domain='),false);
    assert.ok(eventNames.includes('deetoo:cookie-preferences-changed'));
    assert.equal(recorded.expiresAt,new Date(NOW + COOKIE_RECEIPT_DAYS*86400000).toISOString());
    // The purpose guard consults the unexpired receipt; use a receipt based on
    // the real current clock for the second assertion.
    saveCookiePreferences({functional:false,analytics:true,marketing:false},'settings',Date.now());
    assert.equal(readCookieReceipt()?.preferences.analytics,true);
    assert.equal(canUseCookiePurpose('analytics'),true);
    assert.equal(runWithCookieConsent('marketing',()=>{started++;}),false);
    assert.equal(started,0);
  } finally {
    if(descriptor)Object.defineProperty(globalThis,'document',descriptor);
    else delete (globalThis as any).document;
    if(windowDescriptor)Object.defineProperty(globalThis,'window',windowDescriptor);
    else delete (globalThis as any).window;
    if(locationDescriptor)Object.defineProperty(globalThis,'location',locationDescriptor);
    else delete (globalThis as any).location;
  }
});
