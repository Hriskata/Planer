import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test('editing a task and reopening its "История" shows the create + edit entries', async ({ page }) => {
  await login(page);

  await page.locator('.day-grid').click({ position: { x: 40, y: 250 } });
  await expect(page.getByText('Нов пост')).toBeVisible();
  await page.getByLabel('Заглавие', { exact: true }).fill('История тест');
  await page.getByLabel('Клиент', { exact: true }).fill('ИсторияКлиент1');
  await page.getByRole('button', { name: 'Запази' }).click();
  await expect(page.getByText('Нов пост')).not.toBeVisible();

  // Reopen and change the title — this is the edit the "История" dialog should surface.
  await page.locator('.post', { hasText: 'ИсторияКлиент1' }).click();
  await expect(page.getByText('Редакция на пост')).toBeVisible();
  await page.getByLabel('Заглавие', { exact: true }).fill('История тест 2');
  await page.getByRole('button', { name: 'Запази' }).click();
  await expect(page.getByText('Редакция на пост')).not.toBeVisible();

  await page.locator('.post', { hasText: 'ИсторияКлиент1' }).click();
  await expect(page.getByText('Редакция на пост')).toBeVisible();
  await page.getByRole('button', { name: 'История', exact: true }).click();

  const historyDialog = page.getByRole('dialog', { name: 'История' });
  await expect(historyDialog).toBeVisible();
  await expect(historyDialog.getByText('e2euser редактира')).toBeVisible();
  await expect(historyDialog.getByText('e2euser създаде')).toBeVisible();
  await expect(historyDialog.getByText('История тест 2')).toBeVisible();
});

test('Активност feed shows recent events, including a deleted task', async ({ page }) => {
  await login(page);

  await page.locator('.day-grid').click({ position: { x: 40, y: 350 } });
  await expect(page.getByText('Нов пост')).toBeVisible();
  await page.getByLabel('Заглавие', { exact: true }).fill('За фийда');
  await page.getByLabel('Клиент', { exact: true }).fill('ИсторияКлиент2');
  await page.getByRole('button', { name: 'Запази' }).click();
  await expect(page.getByText('Нов пост')).not.toBeVisible();

  page.once('dialog', (d) => d.accept());
  await page.locator('.post', { hasText: 'ИсторияКлиент2' }).click();
  await expect(page.getByText('Редакция на пост')).toBeVisible();
  await page.getByRole('button', { name: 'Изтрий' }).click();
  await expect(page.getByText('Редакция на пост')).not.toBeVisible();

  await page.getByRole('button', { name: 'Активност' }).click();
  await expect(page.getByRole('heading', { name: 'Скорошна активност' })).toBeVisible();

  // Scoped to the specific "За фийда" row (not a bare text match) — the shared e2e
  // backend/DB accumulates history entries across every spec in this suite, so other
  // specs' own "изтри"/"създаде" events are already in the same feed.
  const deletedEntry = page.locator('.history-list li').filter({ hasText: 'За фийда' }).filter({ hasText: 'изтри' });
  await expect(deletedEntry).toBeVisible();
  await expect(deletedEntry).toContainText('e2euser');
});
