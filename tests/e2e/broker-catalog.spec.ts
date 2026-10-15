import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fa } from '../../packages/i18n/src/index';

const sample = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/mt5-export.sample.json', import.meta.url)), 'utf8'));
const index = (exportedAt: string) => ({
  format: 'amix-broker-catalog', version: 1, updatedAt: exportedAt,
  entries: [{ id: 'sample-standard', broker: 'Sample Broker', accountType: 'Standard', server: 'Sample-Demo', platform: 'MT5', file: 'sample-standard.json', exportedAt, symbolCount: 7, accountCurrency: 'USD', leverage: 100 }],
});

test('choose a broker from the catalog, import, and get notified of a newer export (Persian)', async ({ page }) => {
  let exportedAt = new Date(Date.now() - 86_400_000).toISOString();
  await page.route('https://raw.githubusercontent.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/index.json')) return route.fulfill({ json: index(exportedAt) });
    if (url.includes('/sample-standard.json')) return route.fulfill({ json: { ...sample, exportedAt } });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/');
  await page.getByRole('radio', { name: 'فارسی' }).check();
  await page.getByRole('button', { name: fa['disclaimer.accept'] }).click();

  await page.goto('/#/instruments/catalog');
  await page.getByTestId('catalog-sample-standard').getByRole('button', { name: fa['cat.choose'] }).click();
  await page.getByTestId('mt-import').click();
  await expect(page).toHaveURL(/#\/instruments$/);
  await expect(page.getByText('EURUSD.m')).toBeVisible();

  // A newer weekly export appears; force the weekly check by ageing lastCheckedAt.
  exportedAt = new Date().toISOString();
  await page.goto('/#/instruments/catalog');
  await expect(page.getByText(fa['cat.updateAvailable'])).toBeVisible();
});

test('catalog offline shows a retryable error, not a crash', async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/**', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: /I understand|متوجه شدم|فهمت/ }).click();
  await page.goto('/#/instruments/catalog');
  await expect(page.getByRole('button', { name: /Try again|تلاش دوباره|إعادة المحاولة/ })).toBeVisible();
});
