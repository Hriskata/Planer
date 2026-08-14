import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test('month view navigation changes the displayed month label', async ({ page }) => {
  await login(page);
  await page.getByText('Месец', { exact: true }).click();

  const label = page.locator('main h2');
  const initialLabel = await label.textContent();

  await page.getByLabel('Напред').click();
  await expect(label).not.toHaveText(initialLabel);

  await page.getByLabel('Назад').click();
  await expect(label).toHaveText(initialLabel);
});
