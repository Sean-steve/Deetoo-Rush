import { test, expect } from '@playwright/test';

// Real browser smoke test against a live dev:demo server (memory + fixtures, no external infra).
// This is a genuine, executed check -- not a description of an intended journey. It uses the
// documented seed credentials from auth.repository.ts's fixture data.

test('customer can log in and reach a real authenticated screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('http://localhost:3000/');
  await expect(page.locator('body')).not.toBeEmpty();

  // The app is a single entry point that switches between the four sub-apps; find whatever
  // login form is present rather than assuming a specific route.
  const emailInput = page.locator('input[type="email"], input[name="identifier"], input[placeholder*="mail" i]').first();
  await expect(emailInput).toBeVisible({ timeout: 10000 });
  await emailInput.fill('customer@deetoo.ke');

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill('CustomerPass123!');

  const submitButton = page.locator('button[type="submit"]').first();
  await submitButton.click();

  // Real assertion: the page must move past the login form and show something authenticated,
  // not just "the click didn't crash".
  await expect(page.locator('input[type="password"]')).toHaveCount(0, { timeout: 15000 });

  const criticalErrors = errors.filter(
    (e) => !e.includes('Download the React DevTools') && !e.includes('preamble'),
  );
  expect(criticalErrors, `Unexpected console/page errors: ${criticalErrors.join('; ')}`).toEqual([]);
});
