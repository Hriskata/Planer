import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Pure YYYY-MM-DD string arithmetic (local-components Date, no timezone conversion) —
// mirrors frontend/src/lib/date.js's addDays exactly, applied to a date string already
// read back from the app itself (the "Дата" field's own value), not from Node's own
// notion of "today".
function addDaysStr(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// PostTile renders "client - post_type" (falling back to title only if BOTH are empty)
// — NOT the title — so every assertion below matches on `client`, not `title`. See
// CLAUDE.md's documented gotcha about this exact trap.
async function createDailySeries(page, { title, client, days }) {
  await page.locator('.day-grid').click({ position: { x: 40, y: 250 } });
  await expect(page.getByText('Нов пост')).toBeVisible();
  const anchorDate = await page.getByLabel('Дата (по избор)', { exact: true }).inputValue();

  await page.getByLabel('Заглавие', { exact: true }).fill(title);
  await page.getByLabel('Клиент', { exact: true }).fill(client);
  await page.getByLabel('Повтаря се', { exact: true }).check();
  // A plain CSS selector, not getByLabel — the accessible-name lookup for this select
  // was observed to hang indefinitely in this suite for reasons not fully understood;
  // scoping by the wrapping .recurrence-fields class resolves instantly and unambiguously.
  await page.locator('.recurrence-fields select').selectOption('daily');
  await page.locator('.recurrence-fields input[type="date"]').fill(addDaysStr(anchorDate, days - 1));
  await page.getByRole('button', { name: 'Запази' }).click();
  await expect(page.getByText('Нов пост')).not.toBeVisible();

  return anchorDate;
}

test('creating a daily series shows a tile on every day, each with the repeat icon', async ({ page }) => {
  await login(page);
  await createDailySeries(page, { title: 'Серия А', client: 'СерияКлиент1', days: 2 });

  await expect(page.locator('.post', { hasText: 'СерияКлиент1' })).toBeVisible();
  await expect(page.locator('.post', { hasText: 'СерияКлиент1' }).locator('.repeat-badge')).toBeVisible();

  await page.getByRole('button', { name: 'Напред' }).click();
  await expect(page.locator('.post', { hasText: 'СерияКлиент1' })).toBeVisible();
});

test('editing "само тази" detaches just that occurrence, the rest keep the series', async ({ page }) => {
  await login(page);
  await createDailySeries(page, { title: 'Серия Б', client: 'СерияКлиент2', days: 2 });

  await page.locator('.post', { hasText: 'СерияКлиент2' }).click();
  await expect(page.getByText('Част от повтаряща се поредица')).toBeVisible();
  // Editing the client (not the title) so the change is visible on the tile itself —
  // PostTile shows client/post_type, not title.
  await page.getByLabel('Клиент', { exact: true }).fill('ОтделенКлиент');
  await page.getByRole('button', { name: 'Запази' }).click();

  const scopeDialog = page.getByRole('dialog', { name: 'Запазване на промените' });
  await expect(scopeDialog).toBeVisible();
  await scopeDialog.getByRole('button', { name: 'Само тази' }).click();
  await expect(page.getByText('Нов пост')).not.toBeVisible();
  await expect(page.getByText('Редакция на пост')).not.toBeVisible();

  await expect(page.locator('.post', { hasText: 'ОтделенКлиент' })).toBeVisible();
  await expect(page.locator('.post', { hasText: 'ОтделенКлиент' }).locator('.repeat-badge')).not.toBeVisible();

  await page.getByRole('button', { name: 'Напред' }).click();
  await expect(page.locator('.post', { hasText: 'СерияКлиент2' })).toBeVisible();
  await expect(page.locator('.post', { hasText: 'СерияКлиент2' }).locator('.repeat-badge')).toBeVisible();
});

test('deleting "тази и следващите" removes only the matching subset', async ({ page }) => {
  await login(page);
  await createDailySeries(page, { title: 'Серия В', client: 'СерияКлиент3', days: 3 });

  await page.getByRole('button', { name: 'Напред' }).click(); // day 2 of 3
  await page.locator('.post', { hasText: 'СерияКлиент3' }).click();
  await page.getByRole('button', { name: 'Изтрий' }).click();

  const scopeDialog = page.getByRole('dialog', { name: 'Изтриване на пост' });
  await expect(scopeDialog).toBeVisible();
  await scopeDialog.getByRole('button', { name: 'Тази и следващите' }).click();
  await expect(page.locator('.post', { hasText: 'СерияКлиент3' })).not.toBeVisible();

  await page.getByRole('button', { name: 'Назад' }).click(); // back to day 1
  await expect(page.locator('.post', { hasText: 'СерияКлиент3' })).toBeVisible();

  await page.getByRole('button', { name: 'Напред' }).click();
  await page.getByRole('button', { name: 'Напред' }).click(); // day 3
  await expect(page.locator('.post', { hasText: 'СерияКлиент3' })).not.toBeVisible();
});

test('SeriesScopeDialog traps focus and Escape closes only the dialog, not the form underneath', async ({ page }) => {
  await login(page);
  await createDailySeries(page, { title: 'Серия Г', client: 'СерияКлиент4', days: 2 });

  await page.locator('.post', { hasText: 'СерияКлиент4' }).click();
  await page.getByRole('button', { name: 'Запази' }).click();
  const scopeDialog = page.getByRole('dialog', { name: 'Запазване на промените' });
  await expect(scopeDialog).toBeVisible();

  const focusedInsideDialog = await page.evaluate(() => {
    const dialogEl = [...document.querySelectorAll('[role="dialog"]')].find((el) => el.textContent.includes('Кои постове'));
    return dialogEl?.contains(document.activeElement);
  });
  expect(focusedInsideDialog).toBe(true);

  await page.keyboard.press('Escape');
  await expect(scopeDialog).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Редакция на пост' })).toBeVisible();
});
