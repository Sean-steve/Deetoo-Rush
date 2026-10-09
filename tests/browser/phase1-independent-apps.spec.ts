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

test('Customer Web authenticates with cookies, not localStorage, and remains role-scoped', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173');

  await expect(page.locator('.app-switcher')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  const loginForm = page.locator('form').filter({
    has: page.getByPlaceholder('customer@deetoo.ke or +254712345678'),
  });
  await loginForm.getByPlaceholder('customer@deetoo.ke or +254712345678').fill('customer@deetoo.ke');
  await loginForm.locator('input[type="password"]').fill('CustomerPass123!');
  await loginForm.getByRole('button', { name: 'Sign In', exact: true }).click();

  await expect(page.getByTitle('Sign Out')).toBeVisible();
  await expectSecureWebSession(context);

  const storageKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(storageKeys.filter((key) => key.startsWith('deetoo_auth_'))).toEqual([]);

  const ownStatus = await page.evaluate(async () => (await fetch('/api/v1/customer/addresses')).status);
  const adminStatus = await page.evaluate(async () => (await fetch('/api/v1/admin/orders')).status);
  expect(ownStatus).toBe(200);
  expect(adminStatus).toBe(403);

  await context.close();
});

test('Merchant Web authenticates independently and reaches merchant-scoped APIs', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174');

  await expect(page.locator('.app-switcher')).toHaveCount(0);
  await page.getByPlaceholder('merchant.owner@deetoo.ke').fill('merchant@deetoo.ke');
  await page.locator('input[type="password"]').fill('MerchantPass123!');
  await page.getByRole('button', { name: 'Sign In to Restaurant Console' }).click();

  await expect(page.getByRole('button', { name: 'Sign In to Restaurant Console' })).toHaveCount(0);
  await expectSecureWebSession(context);

  const status = await page.evaluate(async () => (await fetch('/api/v1/merchant/branches')).status);
  expect(status).toBe(200);

  const storageKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(storageKeys.filter((key) => key.startsWith('deetoo_auth_'))).toEqual([]);

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


test('Phase 2 Customer discovery is visual and item customization uses a bottom sheet', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: -1.2683, longitude: 36.8044 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173/customer');

  await expect(page.getByPlaceholder('Search DeeToo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open now' })).toBeVisible();

  const restaurants = page.locator('.customer-restaurant-card');
  await expect(restaurants.first()).toBeVisible({ timeout: 15_000 });
  await expect(restaurants.first().locator('.customer-restaurant-media')).toBeVisible();

  await restaurants.first().click();
  const customizableItem = page.locator('[aria-label^="Customize "]').first();
  await expect(customizableItem).toBeVisible({ timeout: 15_000 });
  await customizableItem.click();

  const sheet = page.locator('dialog.deetoo-bottom-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Add · KES|Sign in to add/ })).toBeVisible();

  await context.close();
});


test('Phase 3 Merchant workspace exposes persistent store control and urgency-first kitchen board', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174');

  await page.getByPlaceholder('merchant.owner@deetoo.ke').fill('merchant@deetoo.ke');
  await page.locator('input[type="password"]').fill('MerchantPass123!');
  await page.getByRole('button', { name: 'Sign In to Restaurant Console' }).click();

  // The Merchant v2 design replaces the old sticky branch command and adds a completed lane.
  await expect(page.getByRole('combobox', { name: 'Operating branch' })).toBeVisible({ timeout: 15_000 });
  const storeControl = page.getByRole('button', { name: /Store (open|paused|closed)/i });
  await expect(storeControl).toBeVisible();
  await storeControl.click();
  const storeMenu = page.getByRole('group', { name: 'Store status' });
  await expect(storeMenu.getByRole('button', { name: 'Open' })).toBeVisible();
  await expect(storeMenu.getByRole('button', { name: 'Paused' })).toBeVisible();
  await expect(storeMenu.getByRole('button', { name: 'Closed' })).toBeVisible();
  await storeControl.click();

  await expect(page.locator('.merchant-kitchen-summary')).toBeVisible();
  await expect(page.locator('.merchant-kitchen-board')).toBeVisible();
  const columnHeadings = page.locator('.merchant-kitchen-column-head h2');
  await expect(columnHeadings).toHaveCount(4);
  await expect(columnHeadings.nth(0)).toHaveText('New orders');
  await expect(columnHeadings.nth(1)).toHaveText('Preparing');
  await expect(columnHeadings.nth(2)).toHaveText('Ready for pickup');
  await expect(columnHeadings.nth(3)).toHaveText('Completed');

  // Every approved Merchant mockup has a real navigable web route and page heading.
  const merchantNavigation = page.getByRole('navigation', { name: 'Merchant navigation' });
  const merchantScreens = [
    { tab: 'catalogue', nav: 'Menu & availability', heading: 'Menu & availability' },
    { tab: 'finance', nav: 'Finance & settlements', heading: 'Finance & settlements' },
    { tab: 'account', nav: 'Business & team', heading: 'Business & team' },
    { tab: 'branch', nav: 'Branch settings', heading: 'Branch settings' },
    { tab: 'sessions', nav: 'Security & sessions', heading: 'Security & sessions' },
    { tab: 'notifications', nav: 'Notifications', heading: 'Notifications' },
    { tab: 'support', nav: 'Support', heading: 'Support & help center' },
  ];
  for (const screen of merchantScreens) {
    await merchantNavigation.getByRole('button', { name: screen.nav, exact: true }).click();
    const main = page.locator(`.merchant-v2-main[data-merchant-page="${screen.tab}"]`);
    await expect(main).toBeVisible();
    await expect(main.getByRole('heading', { name: screen.heading, exact: true })).toBeVisible();
  }
  await merchantNavigation.getByRole('button', { name: 'Kitchen orders', exact: true }).click();
  await expect(page.locator('.merchant-kitchen-board')).toBeVisible();

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
