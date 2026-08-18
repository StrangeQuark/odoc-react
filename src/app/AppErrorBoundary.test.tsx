import { lazy, Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function FailsOnce({ shouldFail }: { shouldFail: boolean }) {
  if (shouldFail) throw new Error('fixture failure');
  return <p>Recovered screen</p>;
}

describe('AppErrorBoundary', () => {
  it('offers an accessible retry after a rendering failure', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const user = userEvent.setup();
    const { rerender } = render(
      <AppErrorBoundary>
        <FailsOnce shouldFail />
      </AppErrorBoundary>,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Odoc could not display this screen.',
      }),
    ).toBeVisible();

    rerender(
      <AppErrorBoundary>
        <FailsOnce shouldFail={false} />
      </AppErrorBoundary>,
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Recovered screen')).toBeVisible();
    consoleError.mockRestore();
  });

  it('catches a rejected lazy screen and keeps a retry path available', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const RejectedScreen = lazy(async () => {
      throw new Error('lazy route fixture failed');
    });

    render(
      <AppErrorBoundary>
        <Suspense fallback={<p>Loading route…</p>}>
          <RejectedScreen />
        </Suspense>
      </AppErrorBoundary>,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Odoc could not display this screen.',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    consoleError.mockRestore();
  });
});
