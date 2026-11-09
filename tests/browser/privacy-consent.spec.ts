import {expect,test} from '@playwright/test';

const cookieName='deetoo_privacy_consent';

test('public website keeps optional tracking off until an explicit choice',async({page,context})=>{
  await context.clearCookies();
  await page.goto('http://127.0.0.1:5173/');
  const region=page.getByRole('region',{name:'Cookie consent'});
  await expect(region).toBeVisible();
  await expect(region.getByRole('button',{name:'Reject optional'})).toBeVisible();
  await expect(region.getByRole('button',{name:'Customize'})).toBeVisible();
  await expect(region.getByRole('button',{name:'Accept all'})).toBeVisible();
  await region.getByRole('button',{name:'Reject optional'}).click();
  await expect(region).toHaveCount(0);
  const cookie=(await context.cookies()).find(item=>item.name===cookieName);
  expect(cookie).toBeTruthy();
  const saved=JSON.parse(decodeURIComponent(cookie!.value));
  expect(saved.preferences).toEqual({functional:false,analytics:false,marketing:false});
  expect(saved.version).toBe('2026-11-09');
  expect(saved.receiptId).toMatch(/^[0-9a-f-]{36}$/);
  expect(cookie!.sameSite).toBe('Lax');

  await page.reload();
  await expect(page.getByRole('region',{name:'Cookie consent'})).toHaveCount(0);
  await page.getByRole('button',{name:'Open cookie preferences'}).click();
  const modal=page.getByRole('dialog',{name:'Choose your cookies'});
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Always on')).toBeVisible();
  await modal.getByRole('checkbox',{name:'Allow analytics'}).check();
  await modal.getByRole('button',{name:'Save my choices'}).click();
  const updated=JSON.parse(decodeURIComponent((await context.cookies()).find(item=>item.name===cookieName)!.value));
  expect(updated.preferences).toEqual({functional:false,analytics:true,marketing:false});
  expect(updated.source).toBe('settings');
});

test('public cookie notice and footer offer a permanent preferences link',async({page,context})=>{
  await context.clearCookies();
  await page.goto('http://127.0.0.1:5173/cookies');
  await expect(page.getByRole('heading',{name:'Cookies and your choices.'})).toBeVisible();
  await page.getByRole('button',{name:'Cookie settings'}).click();
  await expect(page.getByRole('dialog',{name:'Choose your cookies'})).toBeVisible();
  await page.getByRole('button',{name:'Close preferences'}).click();
  await expect(page.getByRole('region',{name:'Cookie consent'})).toBeVisible();
});

test('Global Privacy Control refuses analytic and marketing tracking even after accept all',async({page,context})=>{
  await context.clearCookies();
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'globalPrivacyControl',{configurable:true,value:true});
  });
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.getByText(/Global Privacy Control blocks analytics/)).toBeVisible();
  await page.getByRole('region',{name:'Cookie consent'}).getByRole('button',{name:'Accept all'}).click();
  const saved=JSON.parse(decodeURIComponent((await context.cookies()).find(item=>item.name===cookieName)!.value));
  expect(saved.preferences).toEqual({functional:true,analytics:false,marketing:false});
  await page.getByRole('button',{name:'Open cookie preferences'}).click();
  await expect(page.getByRole('checkbox',{name:'Allow analytics'})).toBeDisabled();
  await expect(page.getByRole('checkbox',{name:'Allow marketing'})).toBeDisabled();
});

test('cookie choices remain usable on Merchant and Admin without changing their auth screens',async({page,context})=>{
  await context.clearCookies();
  await page.goto('http://127.0.0.1:5174/');
  await expect(page.getByRole('region',{name:'Cookie consent'})).toBeVisible();
  await page.getByRole('region',{name:'Cookie consent'}).getByRole('button',{name:'Reject optional'}).click();
  await page.goto('http://127.0.0.1:5175/');
  // Different localhost ports are the same cookie host; production subdomains
  // each use their own host-only cookies rather than a wide Domain setting.
  await expect(page.getByRole('region',{name:'Cookie consent'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Admin sign in'})).toBeVisible();
  await page.getByRole('button',{name:'Open cookie preferences'}).click();
  await page.getByRole('dialog',{name:'Choose your cookies'}).getByRole('button',{name:'Accept all'}).click();
  const saved=JSON.parse(decodeURIComponent((await context.cookies()).find(item=>item.name===cookieName)!.value));
  expect(saved.preferences).toEqual({functional:true,analytics:true,marketing:true});
});
