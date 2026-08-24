import { expect, test as base, type Page } from '@playwright/test';

/**
 * A real-stack session fixture for browser tests. Authentication is deliberately
 * centralized here so the migration from the temporary development account to
 * Phase 1 cookie sessions changes one test boundary instead of every spec.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, provide) => {
    const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@example.test`;
    await page.goto('/');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('correct-horse-battery-staple');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(
      page.getByRole('button', { name: 'Enter verification code' }),
    ).toBeVisible();

    let messageId = '';
    for (let attempt = 0; attempt < 20 && !messageId; attempt += 1) {
      const messages = await page.request.get(
        'http://127.0.0.1:8025/api/v1/messages',
      );
      const payload = (await messages.json()) as {
        messages?: Array<{
          ID?: string;
          To?: Array<{ Address?: string }>;
        }>;
      };
      messageId =
        payload.messages?.find((message) =>
          message.To?.some((recipient) => recipient.Address === email),
        )?.ID ?? '';
      if (!messageId) await page.waitForTimeout(250);
    }
    expect(messageId).not.toBe('');
    const message = await page.request.get(
      `http://127.0.0.1:8025/api/v1/message/${messageId}`,
    );
    const text = ((await message.json()) as { Text?: string }).Text ?? '';
    const verifier = text.match(/code:\s*([A-Za-z0-9_-]+)/)?.[1];
    expect(verifier).toBeTruthy();

    await page.getByRole('button', { name: 'Enter verification code' }).click();
    await page.getByLabel('Verification code').fill(verifier!);
    await page.getByRole('button', { name: 'Verify email' }).last().click();
    await expect(
      page.getByRole('button', { name: 'Enter verification code' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Create space' }),
    ).toBeVisible();
    await provide(page);
  },
});

export { expect };
