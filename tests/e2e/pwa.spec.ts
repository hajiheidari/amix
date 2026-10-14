import { expect, test } from '@playwright/test';
import { en } from '../../packages/i18n/src/index';

test('launches offline after the service worker has installed', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: en['disclaimer.accept'] }).click();
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state;
  });
  // Wait until the SW controls the page
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: en['dash.title'] })).toBeVisible();
  await expect(page.getByText(en['app.offline'])).toBeVisible();
  await page.goto('/#/calculators/pipTick');
  await expect(page.getByRole('heading', { name: en['calc.title'] })).toBeVisible();
  await context.setOffline(false);
});

test('update is prompted, never forced: registration uses a waiting worker', async ({ page }) => {
  await page.goto('/');
  const swText = await page.evaluate(async () => (await fetch('./sw.js')).text());
  // generateSW with registerType "prompt" must not call skipWaiting() on install.
  expect(swText).not.toMatch(/self\.skipWaiting\(\)\s*[,;]?\s*\w*\.clientsClaim/);
  expect(swText).toContain('SKIP_WAITING');
});
