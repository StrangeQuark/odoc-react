import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9JxjwAAAAASUVORK5CYII=',
  'base64',
);

// A genuine, tiny VP9/WebM clip made locally with ffmpeg. Keeping it inline
// makes the browser test deterministic while proving the native media element
// can parse the uploaded bytes; a header-shaped fake is not enough.
const tinyWebm = Buffer.from(
  'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAJCEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggIs7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiEBpAAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYgd4bwZ89q+JpyBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhAJiWgDgibCBELqBEJqBAhJUw2dAgHNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjAuMTYuMTAwc3PaY8CLY8WIHeG8GfPaviZnyKVFo4dFTkNPREVSRIeYTGF2YzYwLjMxLjEwMiBsaWJ2cHgtdnA5Z8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMC4yMDAwMDAwMDAAH0O2dUCC54EAo6mBAACAgkmDQgAA8AD2ADgkHBhCAAAgIABMh//7wRn///1oIP//9CkxgKOTgQAoAIYAQJKcAElAAAMgAABCQKOTgQBQAIYAQJKcAErAAAMgAABCQKOTgQB4AIYAQJKcAEnAAAMgAABCQBxTu2uRu4+zgQC3iveBAfGCAaTwgQM=',
  'base64',
);

async function createEditablePage(page: Page, label: string) {
  // Fully-parallel browser runs can start within the same millisecond. Keep
  // fixture data unique without sharing a mutable test counter between workers.
  const suffix = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await page.getByRole('button', { name: 'Create space' }).click();
  await page
    .getByLabel('Key')
    .fill(`ED${Math.random().toString(36).slice(2, 12).toUpperCase()}`);
  await page.getByLabel('Name').fill(`Editor ${suffix}`);
  await page.getByRole('button', { name: 'Create space' }).last().click();
  await page.getByRole('button', { name: 'New page' }).click();
  await page.getByLabel('Title').fill(`Editor page ${suffix}`);
  await page.getByRole('button', { name: 'Create page' }).click();
  return page.getByLabel('Document content');
}

test('keeps Tab in the editor and saves intentional blank paragraphs', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(45_000);
  const editor = await createEditablePage(page, 'tab');

  await editor.fill('Before');
  await editor.press('Tab');
  await page.keyboard.type('After');
  await expect(editor).toBeFocused();
  await editor.press('Enter');
  await editor.press('Enter');
  await page.keyboard.type('After a blank paragraph');
  await page.getByRole('button', { name: 'Publish changes' }).click();

  const renderedDocument = page.locator('.tiptap-content .tiptap');
  await expect(renderedDocument).toContainText('After a blank paragraph');
  expect(await renderedDocument.textContent()).toContain('Before\tAfter');
  await expect(page.locator('.tiptap-content .tiptap > p')).toHaveCount(3);
});

test('keeps an unsaved editor open when logout navigation is dismissed', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(45_000);
  const editor = await createEditablePage(page, 'exit-guard');

  await editor.fill('Keep this unpublished change');
  await expect(page.getByText('Unsaved changes')).toBeVisible();

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(editor).toBeVisible();
  await expect(editor).toContainText('Keep this unpublished change');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('blocks workspace navigation while media is uploading', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(45_000);
  const editor = await createEditablePage(page, 'upload-exit-guard');
  await page.route('**/api/v1/spaces/*/media', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.continue();
  });

  await editor.fill('Wait for this upload');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'uploading.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  });
  await expect(page.getByText('Uploading uploading.png…')).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(
    page.getByText(
      'Media is still uploading. Wait for all uploads to finish before leaving this page.',
    ),
  ).toBeVisible();
  await expect(editor).toBeVisible();
});

test('nests and outdents task items without leaving the editor', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(45_000);
  const editor = await createEditablePage(page, 'task-tab');

  await editor.fill('First task');
  await page.getByRole('button', { name: 'Tasks' }).click();
  await editor.press('End');
  await editor.press('Enter');
  await page.keyboard.type('Second task');
  await editor.press('Tab');
  await expect(editor).toBeFocused();
  await expect(
    editor.locator('ul[data-type="taskList"] ul[data-type="taskList"]'),
  ).toHaveCount(1);

  await editor.press('Shift+Tab');
  await expect(editor).toBeFocused();
  await expect(
    editor.locator('ul[data-type="taskList"] ul[data-type="taskList"]'),
  ).toHaveCount(0);
});

test('imports media through the picker and persists caption and positioning', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(45_000);
  const editor = await createEditablePage(page, 'media');

  await page.route('**/api/v1/spaces/*/media', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await editor.fill('A media-rich document');
  await expect(page.locator('input[type="file"]')).toBeHidden();
  const fileChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add image or video' }).click();
  await (
    await fileChooser
  ).setFiles({
    name: 'architecture.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  });
  await expect(
    page.getByRole('button', { name: 'Uploading media…' }),
  ).toBeDisabled();
  const media = page.locator('.document-media').first();
  await expect(media.locator('img')).toBeVisible();

  await media.locator('.document-media-frame').click();
  await expect(page.getByLabel('Media alignment')).toBeVisible();
  await page.getByRole('button', { name: 'Right', exact: true }).click();
  await page.getByRole('button', { name: 'Small', exact: true }).click();
  await page.getByLabel('Image alt text').fill('Architecture overview');
  await page.getByLabel('Media caption').fill('Odoc architecture overview');
  await page.getByRole('button', { name: 'Publish changes' }).click();

  await expect(page.getByText('Odoc architecture overview')).toBeVisible();
  await expect(page.locator('.document-media--right')).toBeVisible();
  await expect(page.locator('.document-media--small')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(
          ".odoc-media-node[data-media-kind='image'][data-media-align='right']",
        )
        .evaluate((element) => getComputedStyle(element).float),
    )
    .toBe('right');
  await page.setViewportSize({ width: 800, height: 900 });
  await expect
    .poll(() =>
      page
        .locator(
          ".odoc-media-node[data-media-kind='image'][data-media-align='right']",
        )
        .evaluate((element) => getComputedStyle(element).float),
    )
    .toBe('none');
});

test('moves selected media with keyboard-accessible controls', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(45_000);
  const editor = await createEditablePage(page, 'move-media');

  await editor.fill('Media ordering');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'first.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  });
  await expect(page.locator('.document-media img')).toHaveCount(1);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'second.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  });
  await expect(page.locator('.document-media img')).toHaveCount(2);

  const media = page.locator('.document-media');
  await media.nth(0).locator('.document-media-frame').click();
  await page.getByLabel('Image alt text').fill('First media');
  await media.nth(1).locator('.document-media-frame').click();
  await page.getByLabel('Image alt text').fill('Second media');

  await media.nth(1).locator('.document-media-frame').click();
  const moveUp = page.getByRole('button', { name: 'Move media up' });
  await expect(moveUp).toBeEnabled();
  await moveUp.focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect
    .poll(() =>
      page
        .locator('.document-media img')
        .evaluateAll((images) => images.map((image) => image.alt)),
    )
    .toEqual(['Second media', 'First media']);
});

test('cleans up an upload removed before it can be published', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(45_000);
  const editor = await createEditablePage(page, 'remove-upload');
  await page.route('**/api/v1/spaces/*/media', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  const cleanupRequest = page.waitForRequest(
    (request) =>
      request.method() === 'DELETE' &&
      /\/api\/v1\/media\/[a-f0-9-]+$/i.test(request.url()),
  );

  await editor.fill('Remove the pending asset');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'temporary.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  });
  await expect(page.getByText('Uploading temporary.png…')).toBeVisible();
  await page.getByRole('button', { name: 'Remove media' }).click();
  await cleanupRequest;
  await expect(page.locator('.document-media')).toHaveCount(0);
});

test('imports a dropped video as a positioned document node', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(45_000);
  const editor = await createEditablePage(page, 'drop-video');

  await editor.evaluate((element, webmBase64) => {
    const bytes = Uint8Array.from(atob(webmBase64), (character) =>
      character.charCodeAt(0),
    );
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([bytes], 'walkthrough.webm', { type: 'video/webm' }),
    );
    element.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        dataTransfer: transfer,
      }),
    );
  }, tinyWebm.toString('base64'));

  const video = page.locator('.document-media video');
  await expect(video).toBeVisible();
  await video.evaluate(async (element: HTMLVideoElement) => {
    if (element.readyState >= HTMLMediaElement.HAVE_METADATA) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('Video metadata did not load.')),
        10_000,
      );
      element.addEventListener(
        'loadedmetadata',
        () => {
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      element.addEventListener(
        'error',
        () => {
          window.clearTimeout(timeout);
          reject(new Error('Video could not be decoded.'));
        },
        { once: true },
      );
    });
  });
  await page.getByRole('button', { name: 'Publish changes' }).click();
  await expect(video).toBeVisible();
});
