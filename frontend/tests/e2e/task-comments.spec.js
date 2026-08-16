import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

async function createTask(page, { title, client }) {
  await page.locator('.day-grid').click({ position: { x: 40, y: 250 } });
  await expect(page.getByText('Нов пост')).toBeVisible();
  await page.getByLabel('Заглавие', { exact: true }).fill(title);
  await page.getByLabel('Клиент', { exact: true }).fill(client);
  await page.getByRole('button', { name: 'Запази' }).click();
  await expect(page.getByText('Нов пост')).not.toBeVisible();
}

async function createShareLink(page, client) {
  await page.getByText('Библиотеки', { exact: true }).click();
  await page.getByRole('button', { name: `Сподели с ${client}` }).click();
  const dialog = page.getByRole('dialog', { name: `Линк за ${client}` });
  await expect(dialog).toBeVisible();
  const link = await dialog.getByLabel('Линк', { exact: true }).inputValue();
  await dialog.getByRole('button', { name: 'Затвори' }).click();
  return link;
}

test('owner leaves a comment and sets a status, visible to a guest visitor, who replies back', async ({ page, browser }) => {
  await login(page);
  await createTask(page, { title: 'Коментиран пост', client: 'КоментарКлиент1' });
  const link = await createShareLink(page, 'КоментарКлиент1');

  // Owner side: open the task, leave a comment, mark "Нужни промени".
  await page.getByText('Планер', { exact: true }).click(); // back to the calendar page
  await page.locator('.post', { hasText: 'КоментарКлиент1' }).click();
  await page.getByRole('button', { name: 'Коментари', exact: true }).click();
  const ownerDialog = page.getByRole('dialog', { name: 'Коментари и одобрение' });
  await expect(ownerDialog).toBeVisible();
  await ownerDialog.getByRole('textbox', { name: 'Нов коментар' }).fill('Моля добави повече снимки.');
  await ownerDialog.getByRole('button', { name: 'Изпрати' }).click();
  await expect(ownerDialog.getByText('Моля добави повече снимки.')).toBeVisible();
  await ownerDialog.getByRole('button', { name: 'Нужни промени' }).click();
  await expect(ownerDialog.getByRole('button', { name: 'Нужни промени' })).toHaveClass(/active/);
  await ownerDialog.getByRole('button', { name: 'Затвори' }).click();

  // Guest side: open the share link, open the task, see the owner's comment + status,
  // reply with their own comment and change the status.
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(link);
  await guestPage.locator('.chip', { hasText: 'Коментиран пост' }).click();
  await guestPage.getByRole('button', { name: 'Коментари', exact: true }).click();
  const guestDialog = guestPage.getByRole('dialog', { name: 'Коментари и одобрение' });
  await expect(guestDialog).toBeVisible();
  await expect(guestDialog.getByText('Моля добави повече снимки.')).toBeVisible();
  await expect(guestDialog.getByText('Собственикът')).toBeVisible();
  await expect(guestDialog.getByRole('button', { name: 'Нужни промени' })).toHaveClass(/active/);

  await guestDialog.getByRole('textbox', { name: 'Нов коментар' }).fill('Готово, добавих снимки.');
  await guestDialog.getByRole('button', { name: 'Изпрати' }).click();
  await expect(guestDialog.getByText('Готово, добавих снимки.')).toBeVisible();
  await expect(guestDialog.getByText('Клиентът')).toBeVisible();
  await guestDialog.getByRole('button', { name: 'Одобрен' }).click();
  await expect(guestDialog.getByRole('button', { name: 'Одобрен' })).toHaveClass(/active/);
  await guestDialog.getByRole('button', { name: 'Затвори' }).click();
  await guestContext.close();

  // Owner reloads and sees the guest's reply + status change.
  await page.reload();
  await page.locator('.post', { hasText: 'КоментарКлиент1' }).click();
  await page.getByRole('button', { name: 'Коментари', exact: true }).click();
  const reopenedDialog = page.getByRole('dialog', { name: 'Коментари и одобрение' });
  await expect(reopenedDialog.getByText('Готово, добавих снимки.')).toBeVisible();
  await expect(reopenedDialog.getByRole('button', { name: 'Одобрен' })).toHaveClass(/active/);
});

test('CommentsDialog traps focus and Escape closes only the dialog, not the form underneath', async ({ page }) => {
  await login(page);
  await createTask(page, { title: 'Фокус тест', client: 'КоментарКлиент2' });

  await page.locator('.post', { hasText: 'КоментарКлиент2' }).click();
  await page.getByRole('button', { name: 'Коментари', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Коментари и одобрение' });
  await expect(dialog).toBeVisible();

  const focusedInsideDialog = await page.evaluate(() => {
    const dialogEl = [...document.querySelectorAll('[role="dialog"]')].find((el) => el.textContent.includes('Коментари и одобрение'));
    return dialogEl?.contains(document.activeElement);
  });
  expect(focusedInsideDialog).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Редакция на пост' })).toBeVisible();
});
