import { act, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { server } from '../test/server';
import { AUTH_SESSION_EXPIRED_EVENT } from '../shared/api';
import { safeLocalReturnPath } from './authNavigation';
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

  it('accepts only local relative return paths', () => {
    expect(safeLocalReturnPath('/spaces/engineering?view=recent')).toBe(
      '/spaces/engineering?view=recent',
    );
    expect(safeLocalReturnPath('https://example.test/steal')).toBe('/');
    expect(safeLocalReturnPath('//example.test/steal')).toBe('/');
    expect(safeLocalReturnPath('\\\\example.test')).toBe('/');
  });

  it('enrolls a new account with a workspace invitation when invite-only is enabled', async () => {
    document.cookie = 'ODOC_CSRF=test-csrf-token; path=/';
    let received: unknown;
    server.use(
      http.get('/api/v1/auth/registration-policy', () =>
        HttpResponse.json({ registrationEnabled: true, inviteOnly: true }),
      ),
      http.post('/api/v1/auth/register', async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(
          {
            userId: 'invited-user',
            email: 'member@example.test',
            expiresAt: '2026-08-18T18:00:00Z',
            emailVerified: false,
          },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole('button', {
        name: 'Create an account with an invitation code',
      }),
    );
    await user.type(screen.getByLabelText('Email'), 'member@example.test');
    await user.type(screen.getByLabelText('Password'), 'a-long-local-password');
    await user.type(
      screen.getByLabelText('Workspace invitation code'),
      'one-time-invitation-verifier',
    );
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByRole('heading', { name: 'Verify your email' }),
    ).toBeVisible();
    expect(received).toEqual({
      email: 'member@example.test',
      password: 'a-long-local-password',
      invitationVerifier: 'one-time-invitation-verifier',
    });
  });

  it('exchanges an invitation fragment once and immediately removes it from the current URL', async () => {
    let verifier: string | undefined;
    window.history.replaceState(null, '', '/invitations/invite-route#v=fragment-verifier');
    server.use(
      http.post('/api/v1/invitations/invite-route/exchange', async ({ request }) => {
        verifier = (await request.json() as { verifier: string }).verifier;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    render(
      <MemoryRouter initialEntries={['/invitations/invite-route']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        'Invitation confirmed. Sign in with the invited email address to join the workspace.',
      ),
    ).toBeVisible();
    expect(verifier).toBe('fragment-verifier');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/invitations/invite-route');
  });

  it('shows an expiry prompt after a protected request reports an expired session', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', {
      name: 'Build a home for what your team knows.',
    });
    await act(async () => {
      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
    });

    expect(
      await screen.findByText(
        'Your session expired. Sign in again to continue.',
      ),
    ).toBeVisible();
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

  it('keeps an unverified account out of workspace queries until its email is verified', async () => {
    document.cookie = 'ODOC_CSRF=test-csrf-token; path=/';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ status: 401, detail: 'Sign in is required.' }),
              {
                status: 401,
                headers: { 'Content-Type': 'application/problem+json' },
              },
            ),
          );
        }
        if (url.endsWith('/auth/login')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                userId: 'user-unverified',
                email: 'unverified@example.test',
                expiresAt: '2026-08-16T00:00:00Z',
                emailVerified: false,
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(new Response('[]', { status: 200 }));
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await user.type(
      await screen.findByLabelText('Email'),
      'unverified@example.test',
    );
    await user.type(screen.getByLabelText('Password'), 'a-long-local-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByRole('heading', { name: 'Verify your email' }),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/v1/workspaces',
      expect.anything(),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/v1/spaces',
      expect.anything(),
    );
  });

  it('lets a local developer enter a space and see an attached repository', async () => {
    document.cookie = 'ODOC_CSRF=test-csrf-token; path=/';
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: 401, detail: 'Sign in is required.' }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/problem+json' },
            },
          ),
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
                revision: 0,
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
