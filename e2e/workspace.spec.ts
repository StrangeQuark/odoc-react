import { expect, test } from './fixtures';

test('creates, edits, and deletes a documentation page', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(20_000);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const spaceName = `E2E space ${suffix}`;
  const pageTitle = `E2E page ${suffix}`;
  await page.getByRole('button', { name: 'Create space' }).click();
  await page
    .getByLabel('Key')
    .fill(`E2E${Math.random().toString(36).slice(2, 12).toUpperCase()}`);
  await page.getByLabel('Name').fill(spaceName);
  await page.getByRole('button', { name: 'Create space' }).last().click();
  await page.getByRole('button', { name: 'New page', exact: true }).click();
  await page.getByLabel('Title').fill(pageTitle);
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
  await page.getByLabel('Search', { exact: true }).fill('Playwright');
  const searchResults = page.getByRole('region', { name: 'Search results' });
  await expect(searchResults).toContainText(pageTitle);
  await expect(searchResults).toContainText('This page was edited in Playwright.');
  await page.getByLabel('Search', { exact: true }).fill('');
  await page.reload();
  await page.getByRole('button', { name: spaceName }).click();
  await page
    .getByRole('complementary', { name: 'Spaces' })
    .getByRole('button', { name: pageTitle })
    .click();
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
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Browser-tested discussion.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Star page' }).click();
  await expect(page.getByRole('button', { name: 'Unstar page' })).toBeVisible();
  await page.getByLabel('More page actions').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete page' }).click();
  await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible();
});
