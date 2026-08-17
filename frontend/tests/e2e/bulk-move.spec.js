import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Mirrors frontend/src/lib/date.js's addDays exactly (local-components constructor, not
// new Date(dateStr), to avoid a UTC-parsing day shift) — used here only to predict where a
// bulk-moved post should land, not to drive the app itself.
function addDaysStr(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// Opens the new-task form via the FAB and sets an explicit date — avoids clicking inside
// a specific day-column's empty space (unreliable: the shared e2e backend/DB accumulates
// posts from other specs across the suite's run, so a fixed click offset can land either
// on an existing post or, if too far down, below the column's actual rendered height).
async function createOnDate(page, date, { title, client }) {
  await page.locator('.fab').click();
  await expect(page.getByText('Нов пост')).toBeVisible();
  await page.getByLabel('Заглавие', { exact: true }).fill(title);
  await page.getByLabel('Клиент', { exact: true }).fill(client);
  await page.getByLabel('Дата (по избор)', { exact: true }).fill(date);
  await page.getByRole('button', { name: 'Запази' }).click();
  await expect(page.getByText('Нов пост')).not.toBeVisible();
}

test('bulk-move: select posts across the week and shift them forward together', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Седмица' }).click();

  const dateA = await page.locator('.day-column').nth(0).getAttribute('data-date');
  const dateB = await page.locator('.day-column').nth(2).getAttribute('data-date');
  const newDateA = addDaysStr(dateA, 3);
  const newDateB = addDaysStr(dateB, 3);

  // PostTile shows "client - post_type" (falling back to title only if both are blank —
  // see PostTile.svelte's postLabel()), so the distinguishing text on the tile itself is
  // the client name, not the title — hence matching on client below, not title.
  await createOnDate(page, dateA, { title: 'Пост', client: 'BulkKlientA' });
  await createOnDate(page, dateB, { title: 'Пост', client: 'BulkKlientB' });
  await expect(page.locator(`.day-column[data-date="${dateA}"]`)).toContainText('BulkKlientA');
  await expect(page.locator(`.day-column[data-date="${dateB}"]`)).toContainText('BulkKlientB');

  // Clicking the checkbox itself (rather than the tile at large) — the tile is narrow in
  // the 7-column week grid, and a plain center-of-element click can land right on the
  // "Завършен" toggle at the tile's far edge instead of the select state.
  await page.getByRole('button', { name: 'Избери', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Избери BulkKlientA' }).check();
  await page.getByRole('checkbox', { name: 'Избери BulkKlientB' }).check();
  await expect(page.getByText('2 избрани')).toBeVisible();

  await page.locator('.bulk-move-amount').fill('3');
  await page.getByRole('button', { name: 'Премести' }).click();
  await expect(page.getByText('2 избрани')).not.toBeVisible();

  await expect(page.locator(`.day-column[data-date="${dateA}"]`)).not.toContainText('BulkKlientA');
  await expect(page.locator(`.day-column[data-date="${dateB}"]`)).not.toContainText('BulkKlientB');
  await expect(page.locator(`.day-column[data-date="${newDateA}"]`)).toContainText('BulkKlientA');
  await expect(page.locator(`.day-column[data-date="${newDateB}"]`)).toContainText('BulkKlientB');
});

test('leaving select mode clears the selection and restores normal click-to-edit', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Седмица' }).click();

  const dateC = await page.locator('.day-column').nth(1).getAttribute('data-date');
  await createOnDate(page, dateC, { title: 'Пост', client: 'BulkKlientC' });

  await page.getByRole('button', { name: 'Избери', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Избери BulkKlientC' }).check();
  await expect(page.getByText('1 избрани')).toBeVisible();

  await page.getByRole('button', { name: 'Отказ', exact: true }).click();
  await expect(page.getByText('1 избрани')).not.toBeVisible();

  // Selection mode is off — clicking the post label now opens the edit form again, not a
  // toggle. Clicking the button by name (not the whole tile at large) for the same reason
  // as the checkbox clicks above — a plain center-of-tile click can land on "Завършен".
  await page.getByRole('button', { name: 'BulkKlientC' }).click();
  await expect(page.getByText('Редакция на пост')).toBeVisible();
});
