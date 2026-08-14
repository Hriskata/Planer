// Not a *.spec.js file itself (Playwright's testDir glob won't pick it up), just
// shared setup for the specs below — same seeded account every run, see
// tests/start-test-backend.js.
export async function login(page) {
  await page.goto('/');
  await page.getByText('Вход', { exact: true }).first().click();
  await page.fill('input[type="text"]', 'e2euser');
  await page.fill('input[type="password"]', 'e2epass123');
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Седмица');
}
