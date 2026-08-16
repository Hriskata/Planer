import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Creates a task via the Ден view's click-to-create (same pattern as tasks.spec.js),
// scoped to a client unique to this file so it doesn't collide with other specs sharing
// the same seeded account/backend.
async function createTask(page, { title, client }) {
  await page.locator('.day-grid').click({ position: { x: 40, y: 250 } });
  await expect(page.getByText('Нов пост')).toBeVisible();
  await page.getByLabel('Заглавие', { exact: true }).fill(title);
  await page.getByLabel('Клиент', { exact: true }).fill(client);
  await page.getByRole('button', { name: 'Запази' }).click();
  await expect(page.getByText('Нов пост')).not.toBeVisible();
}

async function openShareModal(page, client) {
  await page.getByText('Библиотеки', { exact: true }).click();
  await page.getByRole('button', { name: `Сподели с ${client}` }).click();
  const dialog = page.getByRole('dialog', { name: `Линк за ${client}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('generating and copying a client share link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page);
  await createTask(page, { title: 'Пост за клиент А', client: 'ShareLinkClientA' });

  const dialog = await openShareModal(page, 'ShareLinkClientA');
  const linkInput = dialog.getByLabel('Линк', { exact: true });
  await expect(linkInput).toHaveValue(/\/share\//);

  await dialog.getByRole('button', { name: 'Копирай' }).click();
  await expect(dialog.getByText('Копирано.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Затвори' }).click();
});

test('revoking a link and generating a new one issues a different token', async ({ page }) => {
  await login(page);

  const dialog = await openShareModal(page, 'ShareLinkClientA');
  const firstLink = await dialog.getByLabel('Линк', { exact: true }).inputValue();

  page.once('dialog', (d) => d.accept()); // the "Прекратяване на достъпа..." confirm()
  await dialog.getByRole('button', { name: 'Премахни линка' }).click();
  await expect(dialog.getByText('Линкът е премахнат')).toBeVisible();

  await dialog.getByRole('button', { name: 'Генерирай нов линк' }).click();
  const secondLink = await dialog.getByLabel('Линк', { exact: true }).inputValue();
  expect(secondLink).not.toBe(firstLink);

  await dialog.getByRole('button', { name: 'Затвори' }).click();
});

test('a visitor with a valid link sees only that client\'s tasks, logged out', async ({ page, browser }) => {
  await login(page);
  await createTask(page, { title: 'Пост за клиент Б', client: 'ShareLinkClientB' });

  const dialog = await openShareModal(page, 'ShareLinkClientB');
  const link = await dialog.getByLabel('Линк', { exact: true }).inputValue();
  await dialog.getByRole('button', { name: 'Затвори' }).click();

  // Fresh, fully logged-out browser context — the share link must work with no session.
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(link);

  await expect(guestPage.getByRole('heading', { name: 'Календар на ShareLinkClientB' })).toBeVisible();
  await expect(guestPage.locator('.chip', { hasText: 'Пост за клиент Б' })).toBeVisible();
  await expect(guestPage.locator('.chip', { hasText: 'Пост за клиент А' })).not.toBeVisible();

  await guestContext.close();
});

test('a task opened from the shared page is read-only', async ({ page, browser }) => {
  await login(page);
  const dialog = await openShareModal(page, 'ShareLinkClientB');
  const link = await dialog.getByLabel('Линк', { exact: true }).inputValue();
  await dialog.getByRole('button', { name: 'Затвори' }).click();

  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(link);

  await guestPage.locator('.chip', { hasText: 'Пост за клиент Б' }).click();
  const form = guestPage.getByRole('dialog', { name: 'Преглед на пост' });
  await expect(form).toBeVisible();
  // toBeDisabled() on the <fieldset> itself is unreliable in Playwright (fieldset's
  // disabled state isn't exposed as an ARIA "disabled" state on its own group role) —
  // check a representative descendant field instead, which correctly inherits it.
  await expect(form.getByLabel('Заглавие', { exact: true })).toBeDisabled();
  await expect(guestPage.getByRole('button', { name: 'Запази' })).not.toBeVisible();
  await expect(guestPage.getByRole('button', { name: 'Затвори' })).toBeVisible();

  // Focus trap + Escape, same contract as every other dialog in the app.
  const focusedInsideDialog = await guestPage.evaluate(() => {
    const dialogEl = document.querySelector('form[role="dialog"]');
    return dialogEl?.contains(document.activeElement);
  });
  expect(focusedInsideDialog).toBe(true);
  await guestPage.keyboard.press('Escape');
  await expect(form).not.toBeVisible();

  await guestContext.close();
});

test('an unknown token shows a friendly error, not a blank page', async ({ page }) => {
  await page.goto('/share/not-a-real-token');
  await expect(page.getByText('Линкът не съществува или е изтекъл.')).toBeVisible();
});

test('a revoked token shows the same friendly error', async ({ page }) => {
  await login(page);
  const dialog = await openShareModal(page, 'ShareLinkClientA');
  const link = await dialog.getByLabel('Линк', { exact: true }).inputValue();
  page.once('dialog', (d) => d.accept());
  await dialog.getByRole('button', { name: 'Премахни линка' }).click();
  await dialog.getByRole('button', { name: 'Затвори' }).click();

  await page.goto(link);
  await expect(page.getByText('Линкът не съществува или е изтекъл.')).toBeVisible();
});
