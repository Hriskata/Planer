import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test('creating a task via click-to-create in the Ден view shows it on the day', async ({ page }) => {
  await login(page); // lands on the Ден view by default

  await page.locator('.day-grid').click({ position: { x: 40, y: 250 } });
  await expect(page.getByText('Нов пост')).toBeVisible();

  await page.getByLabel('Заглавие', { exact: true }).fill('E2E тестова задача');
  await page.getByLabel('Клиент', { exact: true }).fill('E2E Клиент');
  await page.getByRole('button', { name: 'Запази' }).click();

  await expect(page.getByText('Нов пост')).not.toBeVisible();
  await expect(page.locator('.post', { hasText: 'E2E Клиент' })).toBeVisible();
});

test('toggling a task done marks it complete', async ({ page }) => {
  await login(page);
  const checkbox = page.locator('.post', { hasText: 'E2E Клиент' }).getByRole('checkbox');
  await checkbox.check();
  await expect(checkbox).toBeChecked();
});
