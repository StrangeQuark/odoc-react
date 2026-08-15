import { expect, test } from '@playwright/test';

test('creates, edits, and deletes a documentation page', async ({ page }) => {
  test.setTimeout(20_000);
  const suffix = Date.now().toString();
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Odoc' }).click();
  await page.getByRole('button', { name: 'Create space' }).click();
  await page.getByLabel('Key').fill(`E2E${suffix.slice(-5)}`);
  await page.getByLabel('Name').fill(`E2E space ${suffix}`);
  await page.getByRole('button', { name: 'Create space' }).last().click();
  await page.getByRole('button', { name: 'New page' }).click();
  await page.getByLabel('Title').fill(`E2E page ${suffix}`);
  await page.getByRole('button', { name: 'Create page' }).click();
  const editor = page.getByLabel('Document content');
  await editor.fill('This page was edited in Playwright.');
  await editor.press('Control+a');
  await page.getByLabel('Text style').selectOption('heading-1');
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await expect(
    page.getByRole('heading', { name: 'This page was edited in Playwright.' }),
  ).toBeVisible();
  await expect(
    page.getByText('This page was edited in Playwright.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'View history' }).click();
  await expect(page.getByText('Version 2')).toBeVisible();
  const firstVersion = page
    .locator('.page-history article')
    .filter({ hasText: 'Version 1' });
  await firstVersion.getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('.tiptap-content .tiptap')).toHaveText('');
  await page.getByLabel('Add a comment').fill('Browser-tested discussion.');
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.getByText('Browser-tested discussion.')).toBeVisible();
  await page.getByRole('button', { name: 'Star page' }).click();
  await expect(page.getByRole('button', { name: 'Unstar page' })).toBeVisible();
  await page.getByLabel('More page actions').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
});
