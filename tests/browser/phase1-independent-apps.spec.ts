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

test('Merchant Overview is distinct from Kitchen orders and links to approved workflows',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto('http://127.0.0.1:5174');
 await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
 await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('.mp-sidebar')).toBeVisible({timeout:20000});
 await page.locator('.mp-sidebar nav').getByRole('button',{name:'Overview',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Business overview'})).toBeVisible();
 await expect(page).toHaveURL(/screen=overview/);
 await expect(page.getByRole('heading',{name:'Kitchen pipeline'})).toBeVisible();
 await page.getByRole('button',{name:/Manage kitchen orders/}).click();
 await expect(page.getByRole('heading',{name:'Kitchen orders',exact:true})).toBeVisible();
 await expect(page).toHaveURL(/screen=orders/);
 await context.close();
});

test('Merchant menu availability writes scoped changes and rolls back rejected API mutations',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 const menuId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',categoryId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',itemId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 let available=true,fail=false,writes=0;
 await page.route('**/api/v1/merchant/menus?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:[{id:menuId,name:'Lunch',branch_id:'branch_westlands_01'}]})}));
 await page.route('**/api/v1/merchant/menus/*/categories',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:[{id:categoryId,name:'Mains',menu_id:menuId}]})}));
 await page.route('**/api/v1/merchant/menus/*/items',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:[{id:itemId,menu_id:menuId,category_id:categoryId,name:'Acceptance Burger',price_minor:85000,is_available:true}]})}));
 await page.route('**/api/v1/merchant/branches/*/catalogue?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{menu:{id:menuId},categories:[{id:categoryId,items:[{id:itemId,effective_available:available}]}]}})}));
 await page.route('**/api/v1/merchant/items/*/availability',async route=>{
   writes++;const body=route.request().postDataJSON();
   expect(body.branch_id).toBe('branch_westlands_01'); // Shared browser fixture uses a stable non-UUID ID.
   expect(body.is_available).toBe(!available);
   if(fail){await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{code:'ACCESS_DENIED',message:'Cannot edit menu from this account',request_id:'req_availability_denied'}})});return;}
   available=body.is_available;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{item_id:itemId,is_available:available}})});
 });
 await page.goto('http://127.0.0.1:5174?screen=menu');
 await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
 await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 const toggle=page.getByRole('switch',{name:'Acceptance Burger availability'});
 await expect(toggle).toBeVisible({timeout:20000});
 await expect(toggle).toHaveAttribute('aria-checked','true');
 await toggle.click();
 await expect.poll(()=>writes).toBe(1);
 await expect(toggle).toHaveAttribute('aria-checked','false');
 await page.reload();
 await expect(toggle).toHaveAttribute('aria-checked','false',{timeout:20000});
 fail=true;await toggle.click();
 await expect.poll(()=>writes).toBe(2);
 await expect(page.locator('.mp-toast')).toContainText('not authorized');
 await expect(page.locator('.mp-toast')).not.toContainText('[object Object]');
 await expect(toggle).toHaveAttribute('aria-checked','false');
 await context.close();
});

test('Merchant notification errors remain visible and support retry after database recovery',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 let unavailable=true;
 await page.route('**/api/v1/merchant/inbox?*',route=>unavailable?
  route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'MERCHANT_SCHEMA_MIGRATION_REQUIRED',message:'Notification viewer table missing',request_id:'req_inbox_upgrade'}})}):
  route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:[]})}));
 await page.goto('http://127.0.0.1:5174?screen=notifications');
 await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
 await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Notifications',exact:true})).toBeVisible({timeout:20000});
 await expect(page.getByRole('alert').filter({hasText:'Unable to load notifications'})).toContainText('pnpm db:migrate');
 await expect(page.getByRole('alert').filter({hasText:'Unable to load notifications'})).not.toContainText('[object Object]');
 unavailable=false;await page.getByRole('button',{name:'Retry notifications'}).click();
 await expect(page.getByRole('alert').filter({hasText:'Unable to load notifications'})).toHaveCount(0);
 await expect(page.getByText('Notifications (0)')).toBeVisible();
 await context.close();
});

test('Merchant branch image reports missing object storage instead of claiming an upload',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 await page.route('**/api/v1/media/uploads',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'PRIVATE_STORAGE_UNCONFIGURED',message:'Private object storage is not configured',request_id:'req_no_storage'}})}));
 await page.goto('http://127.0.0.1:5174?screen=branch');
 await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
 await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Branch settings'})).toBeVisible({timeout:20000});
 await page.locator('.mp-p2-branch-image input[type="file"]').setInputFiles({name:'branch.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])});
 await expect(page.getByRole('alert').filter({hasText:'Image upload unavailable'})).toContainText('OBJECT_STORAGE_BUCKET');
 await expect(page.getByRole('alert').filter({hasText:'Image upload unavailable'})).not.toContainText('[object Object]');
 await context.close();
});

test('Merchant Owner can open a real Add branch workflow from the branch switcher',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 let created:any=null;
 await page.route('**/api/v1/merchant/branches?*',async route=>{
  if(route.request().method()==='POST'){
   created=route.request().postDataJSON();
   await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({data:{id:'99999999-9999-4999-8999-999999999999',merchant_id:'merchant_burger_01',...created}})});
  }else await route.continue();
 });
 await page.goto('http://127.0.0.1:5174');
 await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
 await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('.mp-sidebar')).toBeVisible({timeout:20000});
 await page.locator('.mp-sidebar .mp-branch').click();
 await expect(page.getByRole('button',{name:'Add branch',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Add branch',exact:true}).click();
 await page.getByRole('textbox',{name:'Branch name *'}).fill('New Kitchen Branch');
 await page.getByRole('textbox',{name:'Street address *'}).fill('Westlands Road');
 await page.getByRole('textbox',{name:'Town / city *'}).fill('Nairobi');
 await page.getByRole('spinbutton',{name:'Latitude *'}).fill('-1.267');
 await page.getByRole('spinbutton',{name:'Longitude *'}).fill('36.803');
 await page.getByRole('button',{name:'Create branch',exact:true}).click();
 await expect.poll(()=>created).toBeTruthy();
 expect(created.name).toBe('New Kitchen Branch');
 expect(created.country_code).toBe('KE');
 expect(created.latitude).toBe(-1.267);
 await context.close();
});

test('Merchant live Advanced settings shows real branch controls, never demo reset',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto('http://127.0.0.1:5174?screen=branch');
 await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
 await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Branch settings'})).toBeVisible({timeout:20000});
 await page.getByRole('navigation',{name:'Branch settings sections'}).getByRole('button',{name:'Advanced'}).click();
 await expect(page.getByText('Manage advanced, live branch controls for',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Edit ordering rules'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Reset demo settings'})).toHaveCount(0);
 await page.getByRole('button',{name:'Edit ordering rules'}).click();
 await expect(page.getByRole('spinbutton',{name:'Minimum basket amount (Ksh)'})).toBeVisible();
 await context.close();
});

test('Merchant food editor verifies private photo before saving a public catalogue reference',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 const mediaId='88888888-8888-4888-8888-888888888888';
 let foodSaved:any=null,uploadPurpose:string|null=null;
 await page.route('**/api/v1/media/uploads',route=>{uploadPurpose=route.request().postDataJSON()?.reference_type;return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({data:{
   media_id:mediaId,upload_url:'http://127.0.0.1:5174/api/v1/mock-food-storage-put',upload_headers:{'content-type':'image/png'}
 }})});});
 await page.route('**/api/v1/mock-food-storage-put',route=>route.fulfill({status:200,body:''}));
 await page.route('**/api/v1/media/uploads/*/complete',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{status:'VERIFIED',media_id:mediaId}})}));
 await page.route('**/api/v1/merchant/menus/*/items?*',route=>{
  if(route.request().method()==='POST'){
   foodSaved=route.request().postDataJSON();return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({data:{id:'99999999-9999-4999-8999-999999999998',...foodSaved}})});
  }
  return route.continue();
 });
 await page.goto('http://127.0.0.1:5174?screen=menu');
 await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
 await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Menu & availability',exact:true}).first()).toBeVisible({timeout:20000});
 await page.getByRole('button',{name:'Add food item'}).click();
 const modal=page.getByRole('dialog',{name:'food'});
 await modal.getByRole('textbox',{name:'Food name'}).fill('Fresh chapati');
 await modal.getByRole('textbox',{name:'Description'}).fill('Freshly prepared');
 await modal.getByRole('spinbutton',{name:'Price (KES)'}).fill('120');
 await modal.locator('.mp-food-photo-upload input[type=file]').setInputFiles({name:'chapati.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])});
 await expect(modal.getByText('The image is verified privately first')).toBeVisible();
 await modal.getByRole('button',{name:'Save food item'}).click();
 await expect.poll(()=>foodSaved).toBeTruthy();
 expect(uploadPurpose).toBe('MENU_DRAFT');
 expect(foodSaved.image_url).toBe('/api/v1/media/catalogue/'+mediaId);
 await context.close();
});

test('Merchant saved branch cover is shared across sidebar, overview, settings, operations and team',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();
 const cover='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>').toString('base64');
 let coverRequests=0;
 await page.route('**/api/v1/merchant/experience/branches/*/cover-url',route=>{
  coverRequests++;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:{url:cover,cover_media_id:'99999999-9999-4999-8999-999999999999'}})});
 });
 await page.goto('http://127.0.0.1:5174?screen=overview');
 await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
 await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Business overview'})).toBeVisible({timeout:20000});
 await expect(page.locator('.mp-sidebar .mp-branch-image img')).toHaveAttribute('src',cover);
 await expect(page.locator('.mp-overview-brand .mp-branch-image img')).toHaveAttribute('src',cover);
 await page.locator('.mp-sidebar nav').getByRole('button',{name:'Kitchen orders',exact:true}).click();
 await expect(page.locator('.mp-head .mp-branch-banner .mp-branch-image img')).toHaveAttribute('src',cover);
 await page.locator('.mp-sidebar nav').getByRole('button',{name:'Branch settings',exact:true}).click();
 await expect(page.locator('.mp-head .mp-branch-banner .mp-branch-image img')).toHaveAttribute('src',cover);
 await page.locator('.mp-sidebar nav').getByRole('button',{name:'Business & team',exact:true}).click();
 await expect(page.locator('.mp-business-cover-wrap .mp-branch-image img')).toHaveAttribute('src',cover);
 expect(coverRequests).toBeGreaterThan(0);
 await context.close();
});

test('Merchant background refresh preserves the selected screen and in-progress input on temporary branch outage', async ({ browser }) => {
  const context=await browser.newContext();
  const page=await context.newPage();
  let failBackground=false;
  let branchRequests=0;
  await page.route('**/api/v1/merchant/branches',async route=>{
    branchRequests++;
    if(!failBackground){await route.continue();return;}
    // Keep the background request in flight long enough to catch a blocking loading gate.
    await new Promise(resolve=>setTimeout(resolve,600));
    await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({
      error:{code:'BRANCH_UNAVAILABLE',message:'Branch catalogue is temporarily unavailable'}
    })});
  });
  await page.goto('http://127.0.0.1:5174');
  await page.locator('.mp-live-auth input[autocomplete="username"]').fill('merchant@deetoo.ke');
  await page.locator('.mp-live-auth input[type="password"]').fill('MerchantPass123!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.locator('.mp-sidebar')).toBeVisible({timeout:20_000});

  await page.locator('.mp-sidebar nav').getByRole('button',{name:'Menu & availability',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Menu & availability',exact:true}).first()).toBeVisible();
  const search=page.locator('.mp-global-search input');
  await search.fill('unsaved merchant search');
  const before=branchRequests;
  failBackground=true;
  // Focus and the 30-second polling timer use the same resource/branch refresh callback.
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>branchRequests).toBeGreaterThan(before);
  await expect(page.locator('.mp-live-gate')).toHaveCount(0);
  await expect(page.locator('.mp-sidebar')).toBeVisible();
  await expect(search).toHaveValue('unsaved merchant search');
  await expect(page.getByRole('heading',{name:'Menu & availability',exact:true}).first()).toBeVisible();
  await expect(page.locator('.mp-live-error')).toContainText('Branch catalogue is temporarily unavailable');
  await expect(search).toHaveValue('unsaved merchant search');

  failBackground=false;
  const recovered=page.waitForResponse(r=>r.url().includes('/api/v1/merchant/branches')&&r.status()===200);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await recovered;
  await expect(page.locator('.mp-sidebar')).toBeVisible();
  await expect(search).toHaveValue('unsaved merchant search');
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

test('Canonical Admin entry is the approved 16-screen backend-connected experience', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5175/');

  await expect(page.getByRole('heading', {name:'Admin sign in'})).toBeVisible();
  await expect(page.locator('.operations-layout')).toHaveCount(0);
  await expect(page.locator('.dn-demo-banner')).toHaveCount(0);
  await page.getByLabel('Staff email or phone').fill('admin@deetoo.ke');
  await page.getByLabel('Password').fill('AdminPass123!');
  await page.getByRole('button', {name:'Sign in securely'}).click();

  await expect(page.locator('.dn-app')).toBeVisible({timeout:20_000});
  await expect(page.getByText('Live DeeToo backend')).toBeVisible();
  await expect(page.locator('.dn-nav-link')).toHaveCount(16);
  await expect(page.locator('.dn-demo-banner')).toHaveCount(0);
  await expectSecureWebSession(context);
  const status = await page.evaluate(async () => (await fetch('/api/v1/admin/orders')).status);
  expect(status).toBe(200);
  const storageKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(storageKeys.filter((key) => key.startsWith('deetoo_auth_'))).toEqual([]);

  await page.locator('.dn-nav-link').filter({hasText:'Merchants'}).click();
  await expect(page.locator('[data-testid="screen-merchants"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-testid="screen-merchants"]')).toBeVisible({timeout:20_000});
  await context.close();
});

test('Canonical Admin never enables preview fixtures through an environment-independent query flag', async ({browser}) => {
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:5175/?admin-demo=1');
  await expect(page.getByRole('heading',{name:'Admin sign in'})).toBeVisible();
  await expect(page.locator('.dn-demo-banner')).toHaveCount(0);
  await expect(page.locator('.operations-layout')).toHaveCount(0);
  await context.close();
});

test('Phase 1 UI foundation exposes dense Admin layout and honors reduced motion', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5175/?admin-legacy=1');

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
  await page.goto('http://127.0.0.1:5175/?admin-legacy=1');

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
