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

  // Completion data is <option> markup, so the payload must arrive as an
  // attribute value and nothing else: no element created, nothing executed.
  test('autocomplete options carry a payload inertly', async ({ page }) => {
    await page.goto('/journal');
    await page.locator('body').press('a');
    await expect(page.locator('#addmodal')).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(await xssFired(page)).toBe(false);
    // the payload is offered as a completion, as a value rather than markup
    expect(await page.locator('#descriptionnames option[value*="onerror"]').count())
      .toBeGreaterThan(0);
    expect(await page.locator('#descriptionnames img, #accountnames img').count()).toBe(0);
    expect(await page.locator('#descriptionnames script, #accountnames script').count()).toBe(0);
    expect(await xssFired(page)).toBe(false);
  });

  test('a payload typed into the search box is not executed', async ({ page }) => {
    await page.goto('/journal');
    await page.locator('#searchform input[name=q]').fill(PAYLOAD);
    await page.locator('#searchform input[name=q]').press('Enter');
    expect(await xssFired(page)).toBe(false);
    expect(await page.locator('#main-content img[src="x"]').count()).toBe(0);
  });

  // The upload form names the file you picked. A filename is text the user
  // supplies and can contain markup, so it is shown rather than parsed.
  test('the upload form names the chosen file as text', async ({ page }) => {
    const fs = require('fs'), os = require('os'), path = require('path');
    const name = 'x<img src=x onerror="window.__upxss=1">.journal';
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hw-upload-')), name);
    fs.writeFileSync(file, '2025-01-01 x\n    a  1\n    b\n');

    await page.goto('/manage');
    await page.locator('a.btn', { hasText: 'Upload' }).first().click();
    await page.locator('#file').setInputFiles(file);

    await expect(page.locator('#file-info')).toHaveText(name);
    expect(await page.locator('#file-info img').count()).toBe(0);
    expect(await xssFired(page)).toBe(false);
    expect(await page.evaluate(() => window.__upxss)).toBeUndefined();
  });

  test('the edit form shows journal text as text', async ({ page }) => {
    await page.goto('/manage');
    await page.locator('a.btn', { hasText: 'Edit' }).first().click();
    expect(await page.locator('textarea').inputValue()).toContain(PAYLOAD);
    expect(await xssFired(page)).toBe(false);
  });

});
