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
