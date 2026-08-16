import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test('opening the task form moves focus inside it, and Escape closes it', async ({ page }) => {
  await login(page);

  await page.locator('.day-grid').click({ position: { x: 40, y: 250 } });
  const dialog = page.getByRole('dialog', { name: 'Нов пост' });
  await expect(dialog).toBeVisible();

  // Focus should have moved into the dialog (its first focusable field), not stayed on
  // whatever was behind it.
  const focusedInsideDialog = await page.evaluate(() => {
    const dialogEl = document.querySelector('form[role="dialog"]');
    return dialogEl?.contains(document.activeElement);
  });
  expect(focusedInsideDialog).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('opening a settings modal moves focus inside it, and Escape closes it', async ({ page }) => {
  await login(page);

  await page.getByLabel('Настройки', { exact: true }).click();
  await page.getByText('Известия', { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Известия' });
  await expect(dialog).toBeVisible();

  const focusedInsideDialog = await page.evaluate(() => {
    const dialogEl = document.querySelector('[role="dialog"]');
    return dialogEl?.contains(document.activeElement);
  });
  expect(focusedInsideDialog).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
