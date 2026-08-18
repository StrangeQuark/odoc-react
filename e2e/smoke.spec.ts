import { expect, test } from '@playwright/test';

/**
 * This independent-CI lane exercises the shipped static bundle. Its API
 * routes are deliberately intercepted at the browser boundary, so it shares
 * the same generated response shape without relying on a sibling repository
 * or real credentials.
 */
test('loads the production shell and signs in against the contract mock', async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: 'ODOC_CSRF',
      value: 'test-csrf-token',
      url: 'http://127.0.0.1:4173',
      sameSite: 'Strict',
    },
  ]);
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'fixture-user',
        email: 'fixture@example.test',
        expiresAt: null,
        emailVerified: true,
      }),
    }),
  );
  await page.route('**/api/v1/system/info', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        name: 'Odoc',
        status: 'ok',
        timestamp: '2026-08-15T00:00:00Z',
      }),
    }),
  );
  await page.route('**/api/v1/spaces', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'classified-fixture-space',
          workspaceId: 'fixture-workspace',
          key: 'CANARY',
          name: 'classified-fixture-canary',
          description: 'This must remain memory-only.',
          createdAt: '2026-08-15T00:00:00Z',
          updatedAt: '2026-08-15T00:00:00Z',
        },
      ]),
    }),
  );
  await page.route('**/api/v1/workspaces', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'fixture-workspace', name: 'Fixture workspace', role: 'OWNER' },
      ]),
    }),
  );

  await page.goto('/not-found');
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();

  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/ui-preview');
  await expect(
    page.getByRole('heading', { name: 'Odoc component catalog' }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: 'Recent pages' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create space' })).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Put your team’s knowledge somewhere it can grow.',
    }),
  ).toBeVisible();

  const clientPersistence = await page.evaluate(async () => ({
    indexedDatabases:
      typeof indexedDB.databases === 'function'
        ? (await indexedDB.databases()).map((database) => database.name)
        : [],
    localStorage: Object.values(localStorage),
    serviceWorkers:
      'serviceWorker' in navigator
        ? (await navigator.serviceWorker.getRegistrations()).length
        : 0,
    sessionStorage: Object.values(sessionStorage),
  }));
  expect(JSON.stringify(clientPersistence)).not.toContain(
    'classified-fixture-canary',
  );
  expect(clientPersistence.serviceWorkers).toBe(0);
});
