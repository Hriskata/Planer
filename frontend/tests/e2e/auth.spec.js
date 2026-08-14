import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test('logging in shows the calendar with Ден/Седмица/Месец tabs', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Ден', { exact: true })).toBeVisible();
  await expect(page.getByText('Седмица', { exact: true })).toBeVisible();
  await expect(page.getByText('Месец', { exact: true })).toBeVisible();
});

test('a wrong password shows an error instead of logging in', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Вход', { exact: true }).first().click();
  await page.fill('input[type="text"]', 'e2euser');
  await page.fill('input[type="password"]', 'wrong-password');
  await page.click('button[type="submit"]');
  await expect(page.getByText(/грешно/i)).toBeVisible();
});
