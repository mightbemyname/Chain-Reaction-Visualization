import { chromium, expect } from '@playwright/test';

const url = process.argv[2] || 'http://127.0.0.1:4173/probability-lab/';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(url);
  await expect(page.locator('.canvas-header')).toContainText('14 nodes');
  await expect(page.locator('.stats-panel .method-badge')).toHaveText('EXACT');
  await page.getByRole('button', { name: 'Diamond', exact: true }).click();
  await expect(page.locator('.stat-hero strong')).toHaveText('0.694%');
  await page.getByText('Calculation & simulation', { exact: true }).click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/10,000 trials · P\(all\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Compare probabilities' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  expect(errors).toEqual([]);
  console.log(`Production subpath verified: ${url} (assets, exact/simulation workers, charts)`);
} finally { await browser.close(); }
