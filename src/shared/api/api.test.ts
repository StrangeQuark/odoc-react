import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, odocApi } from './index';
import { createThinSliceCommandHandler } from '../../test/handlers';
import { server } from '../../test/server';

const { getRuntimeConfig } = vi.hoisted(() => ({ getRuntimeConfig: vi.fn() }));

vi.mock('../config/runtimeConfig', () => ({ getRuntimeConfig }));

const credentials = { csrfToken: 'test-csrf-token' };

describe('generated API contract boundary', () => {
  beforeEach(() => {
    getRuntimeConfig.mockResolvedValue({
      apiBasePath: '/api/v1',
      release: 'test',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('maps a generated OpenAPI resource response into the UI model', async () => {
    server.use(
      http.get('/api/v1/spaces', ({ request }) => {
        expect(request.headers.get('authorization')).toBeNull();
        return HttpResponse.json([
          {
            id: 'space-1',
            workspaceId: 'workspace-1',
            key: 'ENG',
            name: 'Engineering',
            description: 'Docs',
            createdAt: '2026-08-15T00:00:00Z',
            updatedAt: '2026-08-15T00:00:00Z',
          },
        ]);
      }),
    );

    await expect(odocApi.listSpaces(credentials)).resolves.toEqual([
      expect.objectContaining({ id: 'space-1', key: 'ENG' }),
    ]);
  });

  it('keeps classified API responses out of the browser HTTP cache', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await odocApi.listSpaces(credentials);

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/spaces',
      expect.objectContaining({ cache: 'no-store' }),
    );
    const init = fetchSpy.mock.calls.at(-1)?.[1] as RequestInit;
    expect(new Headers(init.headers).get('X-Request-Id')).toMatch(
      /^[A-Za-z0-9._-]{8,128}$/,
    );
    expect(new Headers(init.headers).get('X-Odoc-Contract-Version')).toBe('v1');
  });

  it('adds the CSRF header to cookie-session mutations but never safe reads', async () => {
    server.use(
      http.post('/api/v1/spaces', ({ request }) => {
        expect(request.headers.get('X-Odoc-Csrf')).toBe('test-csrf-token');
        return HttpResponse.json({
          id: 'space-1',
          workspaceId: 'workspace-1',
          key: 'ENG',
          name: 'Engineering',
          description: '',
          createdAt: '2026-08-15T00:00:00Z',
          updatedAt: '2026-08-15T00:00:00Z',
        });
      }),
    );

    await odocApi.createSpace(credentials, {
      key: 'ENG',
      name: 'Engineering',
      description: '',
    });
  });

  it('changes a local password through the cookie-session transport and refreshes the session shape', async () => {
    server.use(
      http.post('/api/v1/auth/password', async ({ request }) => {
        expect(request.headers.get('X-Odoc-Csrf')).toBe('test-csrf-token');
        expect(await request.json()).toEqual({
          currentPassword: 'correct-horse-battery-staple',
          newPassword: 'new-correct-horse-battery',
        });
        return HttpResponse.json({
          userId: 'user-1',
          email: 'developer@example.test',
          expiresAt: '2026-08-16T00:00:00Z',
          emailVerified: true,
        });
      }),
    );

    await expect(
      odocApi.changePassword(credentials, {
        currentPassword: 'correct-horse-battery-staple',
        newPassword: 'new-correct-horse-battery',
      }),
    ).resolves.toMatchObject({
      email: 'developer@example.test',
      emailVerified: true,
    });
  });

  it('forwards cancellation to a request without turning it into a domain error', async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(
        new DOMException('Request aborted.', 'AbortError'),
      );

    const request = odocApi.search(
      credentials,
      'architecture',
      controller.signal,
    );
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/search?q=architecture',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    fetchMock.mockRestore();
  });

  it('maps a client-side timeout without masking a caller cancellation', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const requestInit = init as RequestInit;
          requestInit.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );

    const request = odocApi.listSpaces(credentials);
    const rejection = expect(request).rejects.toMatchObject({
      name: 'ApiRequestError',
      problem: { status: 408, title: 'Request timeout' },
    });
    await vi.advanceTimersByTimeAsync(15_000);

    await rejection;
  });

  it('fails closed when a server response violates the generated resource contract', async () => {
    server.use(
      http.get('/api/v1/spaces', () => HttpResponse.json([{ key: 'ENG' }])),
    );

    await expect(odocApi.listSpaces(credentials)).rejects.toThrow(
      'API contract violation: space.id must be a string.',
    );
  });

  it('uses the generated system endpoint and rejects an incomplete status payload', async () => {
    server.use(
      http.get('/api/v1/system/info', () =>
        HttpResponse.json({ name: 'Odoc', status: 'ok' }),
      ),
    );

    await expect(odocApi.systemInfo(credentials)).rejects.toThrow(
      'API contract violation: systemInfo.timestamp must be a string.',
    );
  });

  it('uses the generated thin-slice command contract through the standard transport and MSW fixture', async () => {
    server.use(createThinSliceCommandHandler());

    const input = { message: 'phase zero', idempotencyKey: 'thin-slice-key' };
    const first = await odocApi.executeThinSliceEcho(credentials, input);
    const replay = await odocApi.executeThinSliceEcho(credentials, input);

    expect(first).toEqual({
      executionId: 'thin-slice-1',
      message: 'phase zero',
      createdAt: '2026-08-15T00:00:00Z',
    });
    expect(replay).toEqual(first);
  });

  it('maps a divergent thin-slice idempotency replay to the shared conflict problem', async () => {
    server.use(createThinSliceCommandHandler());
    await odocApi.executeThinSliceEcho(credentials, {
      message: 'first',
      idempotencyKey: 'thin-slice-conflict',
    });

    await expect(
      odocApi.executeThinSliceEcho(credentials, {
        message: 'different',
        idempotencyKey: 'thin-slice-conflict',
      }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      problem: {
        status: 409,
        detail: 'Idempotency-Key was already used with a different request.',
      },
    });
  });

  it.each([
    [400, 'Request validation failed.'],
    [401, 'Sign in is required.'],
    [403, 'You cannot access this resource.'],
    [404, 'The requested resource was not found.'],
    [409, 'This resource changed.'],
    [429, 'Too many requests.'],
    [500, 'An unexpected error occurred.'],
  ])(
    'maps a %i RFC 9457 response into a stable typed problem',
    async (status, detail) => {
      server.use(
        http.get('/api/v1/spaces', () =>
          HttpResponse.json(
            {
              detail,
              errors:
                status === 400
                  ? [{ field: 'name', message: 'Choose a name.' }]
                  : [],
              requestId: 'contract-problem-id',
              status,
              title: `HTTP ${status}`,
              type: `https://odoc.local/problems/${status}`,
            },
            {
              status,
              headers:
                status === 429
                  ? { 'Retry-After': '30', 'X-Request-Id': 'header-id' }
                  : { 'X-Request-Id': 'header-id' },
            },
          ),
        ),
      );

      const error = await odocApi.listSpaces(credentials).then(
        () => undefined,
        (reason: unknown) => reason,
      );

      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).toMatchObject({
        problem: {
          detail,
          requestId: 'contract-problem-id',
          status,
          type: `https://odoc.local/problems/${status}`,
        },
      });
      if (error instanceof ApiRequestError && status === 400) {
        expect(error.problem.errors).toEqual([
          { field: 'name', message: 'Choose a name.' },
        ]);
      }
      if (error instanceof ApiRequestError && status === 429) {
        expect(error.retryAfter).toBe('30');
      }
    },
  );

  it('does not expose a malformed intermediary response as an application error', async () => {
    server.use(
      http.get(
        '/api/v1/spaces',
        () =>
          new HttpResponse('<html>upstream failure</html>', {
            status: 502,
            headers: { 'X-Request-Id': 'upstream-id' },
          }),
      ),
    );

    await expect(odocApi.listSpaces(credentials)).rejects.toMatchObject({
      message: 'Request failed (502).',
      problem: { requestId: 'upstream-id', status: 502 },
    });
  });
});
