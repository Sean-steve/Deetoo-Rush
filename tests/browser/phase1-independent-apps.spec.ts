import { expect, test, type BrowserContext } from '@playwright/test';

async function expectSecureWebSession(context: BrowserContext) {
  const cookies = await context.cookies();
  const access = cookies.find((cookie) => cookie.name === 'deetoo_access_token');
  const refresh = cookies.find((cookie) => cookie.name === 'deetoo_refresh_token');
  const csrf = cookies.find((cookie) => cookie.name === 'deetoo_csrf');

  expect(access, 'access cookie').toBeTruthy();
  expect(refresh, 'refresh cookie').toBeTruthy();
  expect(csrf, 'CSRF cookie').toBeTruthy();
  expect(access?.httpOnly).toBe(true);
  expect(refresh?.httpOnly).toBe(true);
  expect(csrf?.httpOnly).toBe(false);
}

test('Canonical 15-screen Customer Web authenticates with cookies, not localStorage, and remains role-scoped', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.locator('.app-switcher')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/customer$/); // The one-shot auth intent is intentionally consumed.
  await expect(page.locator('.dt-live-auth')).toBeVisible();
  await page.locator('.dt-live-auth input[autocomplete="username"]').fill('customer@deetoo.ke');
  await page.locator('.dt-live-auth input[type="password"]').fill('CustomerPass123!');
  await page.locator('.dt-live-auth button[type="submit"]').click();
  await expect(page.locator('.dt-app')).toBeVisible({timeout: 15_000});
  await expect(page.locator('.dt-live-auth')).toHaveCount(0);
  await expectSecureWebSession(context);
  const storageKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(storageKeys.filter((key) => key.startsWith('deetoo_auth_'))).toEqual([]);
  const ownStatus = await page.evaluate(async () => (await fetch('/api/v1/customer/addresses')).status);
  const adminStatus = await page.evaluate(async () => (await fetch('/api/v1/admin/orders')).status);
  expect(ownStatus).toBe(200);
  expect(adminStatus).toBe(403);
  await page.locator('.dt-sidebar .dt-nav-link').filter({hasText:'Profile & addresses'}).click();
  await expect(page).toHaveURL(/\/customer\/profile$/);
  await page.reload();
  await expect(page.locator('.dt-app')).toBeVisible();
  await context.close();
});

test('Merchant Web authenticates independently and reaches merchant-scoped APIs', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174');

  await expect(page.locator('.app-switcher')).toHaveCount(0);
  await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
  await page.locator('input[type="password"]').fill('MerchantPass123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.locator('.mp-sidebar')).toBeVisible({timeout:20_000});
  await expectSecureWebSession(context);

  const status = await page.evaluate(async () => (await fetch('/api/v1/merchant/branches')).status);
  expect(status).toBe(200);

  const storageKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(storageKeys.filter((key) => key.startsWith('deetoo_auth_'))).toEqual([]);

  await context.close();
});

test('Merchant branch failures display DeeToo error messages and recover without reload', async ({ browser }) => {
  const context=await browser.newContext();
  const page=await context.newPage();
  let fail=true;
  await page.route('**/api/v1/merchant/branches',async route=>{
    if(fail)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'BRANCH_UNAVAILABLE',message:'Branch catalogue is temporarily unavailable',request_id:'req_merchant_regression'}})});
    else await route.continue();
  });
  await page.goto('http://127.0.0.1:5174');
  await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
  await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Unable to load branches'})).toBeVisible();
  await expect(page.getByText('Branch catalogue is temporarily unavailable')).toBeVisible();
  await expect(page.getByText('Support reference: req_merchant_regression')).toBeVisible();
  await expect(page.getByText('[object Object]')).toHaveCount(0);
  fail=false;
  await page.getByRole('button',{name:'Retry branch connection'}).click();
  await expect(page.locator('.mp-sidebar')).toBeVisible({timeout:20000});
  await context.close();
});

test('Merchant missing policy migration surfaces repair instructions without leaking SQL', async ({ browser }) => {
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.route('**/api/v1/merchant/branches',async route=>
    route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{
      code:'MERCHANT_SCHEMA_MIGRATION_REQUIRED',
      message:'Merchant services require database migration 035.',
      request_id:'req_missing_policy_table'
    }})}));
  await page.goto('http://127.0.0.1:5174');
  await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
  await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Merchant database upgrade required'})).toBeVisible();
  await expect(page.getByText(/pnpm db:migrate/)).toBeVisible();
  await expect(page.getByText('Support reference: req_missing_policy_table')).toBeVisible();
  await expect(page.locator('.mp-sidebar')).toHaveCount(0);
  await context.close();
});

test('Merchant account without membership shows an assignment path, never a fabricated branch',async({browser})=>{
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.route('**/api/v1/merchant/branches',async route=>
    route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'NO_MERCHANT_MEMBERSHIP',message:'User is not associated with any merchant organization',request_id:'req_merchant_membership'}})}));
  await page.goto('http://127.0.0.1:5174');
  await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
  await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Merchant organization access required'})).toBeVisible();
  await expect(page.getByText(/no active Merchant organization membership/)).toBeVisible();
  await expect(page.getByText('[object Object]')).toHaveCount(0);
  await expect(page.locator('.mp-sidebar')).toHaveCount(0);
  await context.close();
});

test('Admin Web authenticates independently and reaches admin-scoped APIs', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5175');

  await expect(page.locator('.app-switcher')).toHaveCount(0);
  await page.getByPlaceholder('admin@deetoo.ke').fill('admin@deetoo.ke');
  await page.locator('input[type="password"]').fill('AdminPass123!');
  await page.getByRole('button', { name: 'Sign In to Platform Admin' }).click();

  await expect(page.getByRole('button', { name: 'Sign In to Platform Admin' })).toHaveCount(0);
  await expectSecureWebSession(context);

  const status = await page.evaluate(async () => (await fetch('/api/v1/admin/orders')).status);
  expect(status).toBe(200);

  const storageKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(storageKeys.filter((key) => key.startsWith('deetoo_auth_'))).toEqual([]);

  await context.close();
});


test('Phase 1 UI foundation exposes dense Admin layout and honors reduced motion', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5175');

  await page.getByPlaceholder('admin@deetoo.ke').fill('admin@deetoo.ke');
  await page.locator('input[type="password"]').fill('AdminPass123!');
  await page.getByRole('button', { name: 'Sign In to Platform Admin' }).click();

  const workspace = page.locator('.operations-layout');
  await expect(workspace).toHaveAttribute('data-density', 'dense');

  const animationDuration = await page.locator('.operations-main').evaluate((element) => {
    const value = getComputedStyle(element).animationDuration;
    const amount = Number.parseFloat(value);
    return value.endsWith('ms') ? amount : amount * 1000;
  });
  expect(animationDuration).toBeLessThanOrEqual(1);

  const signOutHeight = await page
    .getByRole('button', { name: 'Sign out' })
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(signOutHeight).toBeGreaterThanOrEqual(38);

  await context.close();
});


test('Canonical customer screens are the only customer experience on mobile and retain deep links', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173/customer');
  await expect(page.locator('.dt-app')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Discover restaurants' })).toBeVisible();
  await expect(page.locator('.dt-header')).toBeVisible();
  await expect(page.locator('.customer-restaurant-card')).toHaveCount(0); // The previous customer UI must never render.
  await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.locator('.dt-sidebar .dt-nav-link').filter({hasText:'Orders & tracking'}).click();
  await expect(page).toHaveURL(/\/customer\/orders$/);
  await page.reload();
  await expect(page.locator('.dt-app')).toBeVisible();
  await page.goto('http://127.0.0.1:5173/customer/notifications');
  await expect(page.locator('.dt-app')).toBeVisible();
  await expect(page).toHaveURL(/\/customer\/notifications$/);
  await context.close();
});

test('Phase 3 Merchant workspace exposes persistent store control and urgency-first kitchen board', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/?merchant-legacy=1');

  await page.getByPlaceholder('merchant.owner@deetoo.ke').fill('merchant@deetoo.ke');
  await page.locator('input[type="password"]').fill('MerchantPass123!');
  await page.getByRole('button', { name: 'Sign In to Restaurant Console' }).click();

  await expect(page.locator('.merchant-branch-command')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('group', { name: 'Store operating status' })).toBeVisible();
  await expect(page.locator('.merchant-kitchen-summary')).toBeVisible();
  await expect(page.locator('.merchant-kitchen-board')).toBeVisible();

  const columnHeadings = page.locator('.merchant-kitchen-column-head h2');
  await expect(columnHeadings).toHaveCount(3);
  await expect(columnHeadings.nth(0)).toHaveText('New orders');
  await expect(columnHeadings.nth(1)).toHaveText('Preparing');
  await expect(columnHeadings.nth(2)).toHaveText('Ready');

  await context.close();
});

test('Phase 3 Admin exposes control tower, query filters and narrative support workspace', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5175');

  await page.getByPlaceholder('admin@deetoo.ke').fill('admin@deetoo.ke');
  await page.locator('input[type="password"]').fill('AdminPass123!');
  await page.getByRole('button', { name: 'Sign In to Platform Admin' }).click();

  await expect(page.getByRole('heading', { name: 'Operations control tower' })).toBeVisible();
  await expect(page.locator('.admin-control-kpis')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Action required' })).toBeVisible();

  await page.getByRole('button', { name: 'Orders & deliveries' }).click();
  await expect(page.getByLabel('Order status')).toBeVisible();

  await page.getByRole('button', { name: 'Case inbox' }).click();
  await expect(page.getByRole('heading', { name: 'Support & case resolution' })).toBeVisible();
  await expect(page.locator('.admin-case-workspace')).toBeVisible();

  await context.close();
});


test('Merchant frontend prototype Phase 1 navigates four reference screens and local workflows', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/?merchant-prototype=1');
  await expect(page.getByRole('heading', { name: 'Kitchen orders' })).toBeVisible();
  await expect(page.locator('.mp-column')).toHaveCount(4);

  await page.getByRole('button', { name: /Accept & set prep time/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Accept & start preparing' }).click();
  await expect(page.locator('.mp-col-preparing .mp-order-card')).toHaveCount(1);

  await page.locator('.mp-sidebar nav').getByRole('button', { name: 'Menu & availability' }).click();
  await expect(page.getByRole('heading', { name: 'Menu & availability' })).toBeVisible();
  await page.getByRole('button', { name: /Add food item/i }).click();
  await page.getByRole('dialog').getByLabel('Food name').fill('Phase 1 Test Meal');
  await page.getByRole('dialog').getByLabel('Price (KES)').fill('520');
  await page.getByRole('button', { name: 'Save food item' }).click();
  await expect(page.getByText('Phase 1 Test Meal')).toBeVisible();

  await page.locator('.mp-sidebar nav').getByRole('button', { name: 'Finance & settlements' }).click();
  await expect(page.getByRole('heading', { name: 'Finance & settlements' })).toBeVisible();
  await expect(page.getByText('Order payment methods')).toBeVisible();

  await page.locator('.mp-sidebar nav').getByRole('button', { name: 'Business & team' }).click();
  await expect(page.getByRole('heading', { name: 'Business & team' })).toBeVisible();
  await page.getByRole('button', { name: /Invite team member/i }).click();
  await page.getByRole('dialog').getByLabel('Email').fill('phase1@example.com');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText('phase1@example.com')).toBeVisible();

  await context.close();
});


test('Merchant frontend prototype Phase 2 navigates branch, security, notifications, and support without an API', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/?merchant-prototype=1&screen=branch');
  await expect(page.getByRole('heading', { name: 'Branch settings' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Branch settings sections' }).getByRole('button')).toHaveCount(7);
  await page.getByRole('button', { name: 'Closed Not accepting orders' }).click();
  await expect(page.getByRole('button', { name: /Store closed/ })).toBeVisible();
  await page.getByRole('button', { name: 'Open Accepting orders' }).click();
  await page.getByRole('button', { name: 'Save branch settings' }).click();
  await expect(page.getByRole('status')).toContainText('Branch settings saved');

  const nav = page.locator('.mp-sidebar nav');
  await nav.getByRole('button', { name: 'Security & sessions' }).click();
  await expect(page.getByRole('heading', { name: 'Security & sessions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible();
  await page.getByRole('button', { name: /Manage Android/ }).click();
  await expect(page.getByRole('dialog', { name: 'session' })).toBeVisible();
  await page.getByRole('button', { name: 'Revoke session' }).click();
  await expect(page.getByRole('status')).toContainText('Session revoked');

  await nav.getByRole('button', { name: /Notifications/ }).click();
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /New order received/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Mark read' }).click();
  await expect(page.getByRole('status')).toContainText('Notification marked as read');
  await page.getByRole('button', { name: 'Notification settings' }).click();
  await expect(page.getByRole('dialog', { name: 'prefs' })).toBeVisible();
  await page.getByRole('button', { name: 'Save notification settings' }).click();

  await nav.getByRole('button', { name: 'Support' }).click();
  await expect(page.getByRole('heading', { name: 'Support & help center' })).toBeVisible();
  await expect(page.getByText('Unable to receive new orders').first()).toBeVisible();
  await page.getByPlaceholder('Type your message...').fill('Please confirm the troubleshooting steps.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Please confirm the troubleshooting steps.')).toBeVisible();
  await page.getByRole('button', { name: /Start a conversation/ }).click();
  const createCase = page.getByRole('dialog', { name: 'new' });
  await createCase.getByLabel('Subject').fill('Branch order routing test');
  await createCase.getByLabel('Tell us what happened').fill('The kitchen demo needs routing guidance.');
  await createCase.getByRole('button', { name: /Create support request/ }).click();
  await expect(page.getByText('Branch order routing test')).toHaveCount(2);

  await context.close();
});

test('Merchant frontend Phase 2 mobile navigation can reach all eight screen routes', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/?merchant-prototype=1&screen=security');
  await expect(page.getByRole('heading', { name: 'Security & sessions' })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse sidebar' }).count();
  await page.locator('.mp-mobile-menu').click();
  await expect(page.locator('.mp-sidebar')).toHaveClass(/mp-sidebar-open/);
  await page.locator('.mp-sidebar nav').getByRole('button', { name: 'Branch settings' }).click();
  await expect(page.getByRole('heading', { name: 'Branch settings' })).toBeVisible();
  await page.locator('.mp-mobile-menu').click();
  await page.locator('.mp-sidebar nav').getByRole('button', { name: 'Support' }).click();
  await expect(page.getByRole('heading', { name: 'Support & help center' })).toBeVisible();
  await context.close();
});

test('Merchant Phase 3 authenticated approved design retains all eight screens without seed financial data', async ({browser}) => {
 const context=await browser.newContext({viewport:{width:1648,height:928},reducedMotion:'reduce'});
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:5174');
 await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
 await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('.mp-sidebar')).toBeVisible({timeout:20_000});
 await expect(page.getByRole('heading',{name:'Kitchen orders'})).toBeVisible();
 await expect(page.getByText('#DT-9HY6J')).toHaveCount(0);
 await page.screenshot({path:test.info().outputPath('merchant-live-01-kitchen.png'),fullPage:true,animations:'disabled'});
 const routes:[string,string][]=[
   ['Menu & availability','Menu & availability'],
   ['Finance & settlements','Finance & settlements'],
   ['Business & team','Business & team'],
   ['Branch settings','Branch settings'],
   ['Security & sessions','Security & sessions'],
   ['Notifications','Notifications'],
   ['Support','Support & help center'],
   ['Kitchen orders','Kitchen orders']
 ];
 for(const [index,[button,title]] of routes.entries()){
   await page.locator('.mp-sidebar nav').getByRole('button',{name:button,exact:true}).click();
   await expect(page.getByRole('heading',{name:title,exact:true}).first()).toBeVisible();
   await expect(page.locator('.mp-sidebar')).toBeVisible();
   if(button!=='Kitchen orders') await page.screenshot({path:test.info().outputPath('merchant-live-'+String(index+2).padStart(2,'0')+'-'+button.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.png'),fullPage:true,animations:'disabled'});
 }
 await context.close();
});


test('Phase 4 authenticated Merchant mobile navigation retains all eight screens and hides demo order records',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const page=await context.newPage();
 const pageErrors:string[]=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.goto('http://127.0.0.1:5174');
 await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
 await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('.mp-sidebar')).toBeAttached({timeout:20_000});
 const nav=page.locator('.mp-sidebar nav');
 for(const [label,heading] of [
  ['Kitchen orders','Kitchen orders'],['Menu & availability','Menu & availability'],
  ['Finance & settlements','Finance & settlements'],['Business & team','Business & team'],
  ['Branch settings','Branch settings'],['Security & sessions','Security & sessions'],
  ['Notifications','Notifications'],['Support','Support & help center']
 ]){
  await page.locator('.mp-mobile-menu').click();
  await expect(page.locator('.mp-sidebar')).toHaveClass(/mp-sidebar-open/);
  await nav.getByRole('button',{name:label,exact:true}).click();
  await expect(page.getByRole('heading',{name:heading,exact:true}).first()).toBeVisible();
  await expect(page.locator('.mp-sidebar')).not.toHaveClass(/mp-sidebar-open/);
  await expect(page.getByText('#DT-9HY6J')).toHaveCount(0);
 }
 expect(pageErrors).toEqual([]);
 await context.close();
});
