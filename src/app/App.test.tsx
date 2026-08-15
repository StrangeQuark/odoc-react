import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('../shared/runtimeConfig', () => ({
  getRuntimeConfig: () =>
    Promise.resolve({ apiBasePath: '/api/v1', release: 'test' }),
}));

describe('App', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lets a local developer enter a space and see an attached repository', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith('/spaces')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'space-1',
                key: 'ENG',
                name: 'Engineering',
                description: 'Team documentation',
                createdAt: '2026-08-14T00:00:00Z',
                updatedAt: '2026-08-14T00:00:00Z',
              },
            ]),
            { status: 200 },
          ),
        );
      }
      if (url.endsWith('/pages'))
        return Promise.resolve(new Response('[]', { status: 200 }));
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: 'repository-1',
              spaceId: 'space-1',
              githubUrl: 'https://github.com/spring-projects/spring-boot',
              owner: 'spring-projects',
              name: 'spring-boot',
              description: 'Spring Boot',
              defaultBranch: 'main',
              stars: 77000,
              readmeContent: '# Spring Boot',
              readmePath: 'README.md',
              syncedAt: '2026-08-14T00:00:00Z',
            },
          ]),
          { status: 200 },
        ),
      );
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: 'Skip to content' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Build a home for what your team knows.',
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enter Odoc' }));

    expect(
      await screen.findByRole('button', { name: /Engineering/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Engineering/ }));
    expect(
      await screen.findByText('spring-projects/spring-boot'),
    ).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/spaces',
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });
});
