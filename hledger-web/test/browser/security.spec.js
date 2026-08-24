// Security regression tests for the hledger-web UI.
//
// hledger-web is meant to be run locally, but journal data is not always
// trusted (imported CSV, shared files), and the browser is a hostile place to
// interpolate text. Yesod escapes template output by default; these tests
// exist so that a future refactor cannot quietly opt out of it.
//
// Run with: npx playwright test security  (see README.md)
const { test, expect } = require('@playwright/test');

// A payload that executes if it is ever inserted as markup rather than text.
// Tests assert window.__xss stays undefined and the text is shown literally.
const PAYLOAD = '<img src=x onerror="window.__xss=1">';

let pageErrors;
test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err)));
});

async function xssFired(page) {
  return page.evaluate(() => window.__xss !== undefined);
}

test.describe('journal data is rendered as text, not markup', () => {

  // fixture.journal carries the payload in a description, an account name and
  // a comment, so every view that renders them is covered.
  test('the journal view escapes a payload in a description', async ({ page }) => {
    await page.goto('/journal');
    expect(await xssFired(page)).toBe(false);
    await expect(page.locator('#main-content')).toContainText(PAYLOAD);
    expect(await page.locator('#main-content img[src="x"]').count()).toBe(0);
  });

  test('the register view escapes a payload in a description', async ({ page }) => {
    await page.goto('/register?q=inacct:expenses:food:dining');
    expect(await xssFired(page)).toBe(false);
    expect(await page.locator('#main-content img[src="x"]').count()).toBe(0);
  });

  test('the sidebar escapes a payload in an account name', async ({ page }) => {
    await page.goto('/journal');
    await expect(page.locator('#sidebar-menu')).toContainText('xss<script>');
    expect(await page.locator('#sidebar-menu script').count()).toBe(0);
    expect(await xssFired(page)).toBe(false);
  });

  // The add form injects account names and descriptions into a <script> block
  // for autocomplete. That is a javascript string context, not html, so
  // escaping alone would not be enough; the data is base64-encoded instead.
  // If that breaks, the page throws a syntax error and startup dies here.
  test('autocomplete data cannot break out of its script context', async ({ page }) => {
    await page.goto('/journal');
    await page.locator('body').press('a');
    await expect(page.locator('#addmodal')).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(await xssFired(page)).toBe(false);
    // and the completer still works with the payload present in its data
    await page.locator('#addform input.account-input.tt-input').first()
      .pressSequentially('ass', { delay: 30 });
    await expect(
      page.locator('#addform .account-group').first().locator('.tt-suggestion').first()
    ).toBeVisible({ timeout: 3000 });
    expect(await xssFired(page)).toBe(false);
  });

  test('a payload typed into the search box is not executed', async ({ page }) => {
    await page.goto('/journal');
    await page.locator('#searchform input[name=q]').fill(PAYLOAD);
    await page.locator('#searchform input[name=q]').press('Enter');
    expect(await xssFired(page)).toBe(false);
    expect(await page.locator('#main-content img[src="x"]').count()).toBe(0);
  });

  test('the edit form shows journal text as text', async ({ page }) => {
    await page.goto('/manage');
    await page.locator('a.btn', { hasText: 'Edit' }).first().click();
    expect(await page.locator('textarea').inputValue()).toContain(PAYLOAD);
    expect(await xssFired(page)).toBe(false);
  });

});
