import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { App } from './App';

const { getRuntimeConfig } = vi.hoisted(() => ({ getRuntimeConfig: vi.fn() }));
vi.mock('../shared/config/runtimeConfig', () => ({ getRuntimeConfig }));

describe('App', () => {
  beforeEach(() => {
    getRuntimeConfig.mockResolvedValue({
      apiBasePath: '/api/v1',
      release: 'test',
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows a diagnosable startup screen when public runtime configuration fails', async () => {
    getRuntimeConfig.mockRejectedValueOnce(new Error('invalid config'));

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Odoc could not start.' }),
    ).toBeInTheDocument();
  });

  it('has no baseline automated accessibility violations at sign in', async () => {
    const { container } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', {
      name: 'Build a home for what your team knows.',
    });
    await expectNoAxeViolations(container);
  });

  it('renders a recoverable not-found screen for an unknown route', async () => {
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('renders the standard access-denied screen', async () => {
    render(
      <MemoryRouter initialEntries={['/forbidden']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'You do not have access to this page.',
      }),
    ).toBeVisible();
  });

  it('lets a local developer enter a space and see an attached repository', async () => {
    document.cookie = 'ODOC_CSRF=test-csrf-token; path=/';
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) {
        return Promise.resolve(
          new Response(JSON.stringify({ status: 401, detail: 'Sign in is required.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
        );
      }
      if (url.endsWith('/auth/login')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              userId: 'user-1',
              email: 'developer@example.test',
              expiresAt: '2026-08-16T00:00:00Z',
              emailVerified: true,
            }),
            { status: 200 },
          ),
        );
      }
      if (url.endsWith('/workspaces')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'workspace-1',
                name: 'Engineering workspace',
                role: 'OWNER',
              },
            ]),
            { status: 200 },
          ),
        );
      }
      if (url.endsWith('/spaces')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'space-1',
                workspaceId: 'workspace-1',
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
      if (url.endsWith('/system/info')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              name: 'Odoc',
              status: 'ok',
              timestamp: '2026-08-15T00:00:00Z',
            }),
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
      await screen.findByRole('link', { name: 'Skip to content' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Build a home for what your team knows.',
      }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'developer@example.test');
    await user.type(screen.getByLabelText('Password'), 'a-long-local-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

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
