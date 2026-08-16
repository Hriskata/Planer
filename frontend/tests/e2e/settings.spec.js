import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test('"Премахни паролата" clears the password without saving an unsaved email edit', async ({ page }) => {
  await login(page);

  await page.getByLabel('Настройки', { exact: true }).click();
  await page.getByText('Имейл подател', { exact: true }).click();

  // Establish a known, saved starting state.
  await page.getByLabel('Gmail адрес', { exact: true }).fill('original@example.com');
  await page.getByLabel('App Password', { exact: true }).fill('some app password');
  await page.getByRole('button', { name: 'Запази' }).click();
  await expect(page.getByText('Запазено.')).toBeVisible();

  // Edit the email but do NOT save it — then use "Премахни паролата" instead.
  await page.getByLabel('Gmail адрес', { exact: true }).fill('unsaved-edit@example.com');
  await page.getByRole('button', { name: 'Премахни паролата' }).click();
  await expect(page.getByText('Запазено.')).toBeVisible();

  // Reopen the modal fresh (re-fetches from the server) — the email should still be the
  // originally SAVED one, not the unsaved edit that was sitting in the field.
  await page.getByRole('button', { name: 'Затвори' }).click();
  await page.getByLabel('Настройки', { exact: true }).click();
  await page.getByText('Имейл подател', { exact: true }).click();
  await expect(page.getByLabel('Gmail адрес', { exact: true })).toHaveValue('original@example.com');
  await expect(page.getByText('App Password')).not.toContainText('запазена');
});
