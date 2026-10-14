import { expect, test, type Page } from '@playwright/test';
import { ar, fa } from '../../packages/i18n/src/index';

test.use({ timezoneId: 'Asia/Tehran' });

async function start(page: Page, lang: 'fa' | 'ar') {
  await page.goto('/');
  const d = lang === 'fa' ? fa : ar;
  await page.getByRole('radio', { name: lang === 'fa' ? 'فارسی' : 'العربية' }).check();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  await page.getByRole('button', { name: d['disclaimer.accept'] }).click();
}

test('Persian core workflow: account → size → trade → analytics → backup → restore', async ({ page }) => {
  await start(page, 'fa');

  // Create an account (Persian digits in the amount)
  await page.goto('/#/journal/account/new');
  await page.locator('input[name=account-name]').fill('حساب اصلی');
  await page.locator('input[name=opening-amount]').fill('۱۰٬۰۰۰');
  await page.getByRole('button', { name: fa['common.save'] }).click();
  await expect(page).toHaveURL(/#\/journal$/);

  // Position size with the default account (EURUSD example profile)
  await page.goto('/#/calculators/position');
  await page.locator('input[name=entry]').fill('۱٫۱۰۰۰');
  await page.locator('input[name=stop]').fill('۱٫۰۹۵۰');
  await expect(page.getByTestId('position-qty')).toContainText('۰٫۲');
  await expect(page.locator('#position-result')).toContainText('۲۲۰٫۰۰'); // margin at 100:1

  // Record as trade, add an exit fill, save
  await page.getByRole('button', { name: fa['calc.recordTrade'] }).click();
  await expect(page).toHaveURL(/journal\/trade\/new/);
  await page.getByRole('button', { name: fa['jr.addExit'] }).click();
  await page.locator('input[name=fill-price-1]').fill('1.1050');
  await expect(page.getByTestId('trade-net')).toContainText('۱۰۰٫۰۰');
  await page.getByRole('button', { name: fa['common.save'] }).click();
  await expect(page.getByTestId('trades-table')).toContainText('EURUSD');

  // Analytics
  await page.goto('/#/analytics');
  await expect(page.getByTestId('kpis-USD')).toContainText('+۱۰۰٫۰۰');

  // Persistence after reload
  await page.reload();
  await page.goto('/#/journal');
  await expect(page.getByTestId('trades-table')).toContainText('EURUSD');

  // Export backup
  await page.goto('/#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-backup').click()]);
  const path = await download.path();
  expect(download.suggestedFilename()).toMatch(/^amix-backup-.*\.json$/);

  // Erase everything, then restore
  await page.getByRole('button', { name: fa['set.eraseAll'] }).click();
  await page.locator('dialog').getByRole('button', { name: fa['set.eraseAll'] }).click();
  await page.goto('/#/journal');
  await expect(page.getByText(fa['jr.noAccounts'])).toBeVisible();

  await page.goto('/#/settings');
  await page.getByTestId('restore-file').setInputFiles(path!);
  await page.locator('dialog').getByRole('button', { name: fa['common.confirm'] }).click();
  await expect(page.getByText(fa['set.restored'])).toBeVisible();
  await page.goto('/#/journal');
  await expect(page.getByTestId('trades-table')).toContainText('EURUSD');
  await page.goto('/#/analytics');
  await expect(page.getByTestId('kpis-USD')).toContainText('+۱۰۰٫۰۰');
});

test('Arabic RTL: validation messages and Arabic-Indic digits', async ({ page }) => {
  await start(page, 'ar');
  await page.goto('/#/calculators/position');
  await page.getByLabel(ar['calc.accountAmount']).fill('١٠٠٠٠');
  await page.locator('input[name=entry]').fill('١٫١٠٠٠');
  await page.locator('input[name=stop]').fill('١٫٢٠٠٠');
  await page.getByRole('button', { name: ar['common.calculate'] }).click();
  await expect(page.getByText(ar['error.longStopAboveEntry'])).toBeVisible();
  await page.locator('input[name=stop]').fill('١٫٠٩٥٠');
  await expect(page.getByTestId('position-qty')).toContainText('٠٫٢');
  // No horizontal overflow on narrow screens
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('large font setting keeps layout usable', async ({ page }) => {
  await start(page, 'fa');
  await page.goto('/#/settings');
  await page.locator('input[type=range]').fill('1.5');
  await page.goto('/#/journal/trade/new');
  await page.goto('/#/calculators/position');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: fa['common.calculate'] })).toBeVisible();
});
