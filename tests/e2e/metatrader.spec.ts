import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { fa } from '../../packages/i18n/src/index';

const sample = fileURLToPath(new URL('../fixtures/mt5-export.sample.json', import.meta.url));

test('import broker specs from a MetaTrader export and size a position with them (Persian)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'فارسی' }).check();
  await page.getByRole('button', { name: fa['disclaimer.accept'] }).click();

  await page.goto('/#/instruments/import-mt');
  // The export scripts are bundled with the app
  const mq5 = await page.evaluate(async () => (await fetch('./tools/AmixExport.mq5')).text());
  expect(mq5).toContain('amix-mt-symbols');

  await page.getByTestId('mt-file').setInputFiles(sample);
  await expect(page.getByTestId('mt-summary')).toBeVisible();
  await expect(page.getByText(fa['mt.err.unsupportedMode'])).toBeVisible(); // BOND1
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByTestId('mt-import').click();
  await expect(page).toHaveURL(/#\/instruments$/);
  await expect(page.getByText('EURUSD.m')).toBeVisible();
  await expect(page.getByText(fa['inst.ver.broker_verified']).first()).toBeVisible();

  await page.goto('/#/calculators/position');
  const picker = page.getByLabel(fa['common.instrument']);
  const value = await picker.locator('option', { hasText: 'EURUSD.m' }).getAttribute('value');
  await picker.selectOption(value!);
  await page.getByLabel(fa['calc.accountAmount']).fill('۱۰۰۰۰');
  await page.locator('input[name=entry]').fill('1.1000');
  await page.locator('input[name=stop]').fill('1.0950');
  await expect(page.getByTestId('position-qty')).toContainText('۰٫۲');
});
