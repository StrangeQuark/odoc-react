import { http, HttpResponse } from 'msw';

type StoredThinSliceCommand = {
  executionId: string;
  message: string;
  createdAt: string;
};

/**
 * A stateful, profile-gated fixture for the P0 contract command. Product
 * tests do not use this endpoint; it proves that generated clients share the
 * same transport/problem behavior in MSW and in the live Compose smoke.
 */
export function createThinSliceCommandHandler() {
  const commands = new Map<string, StoredThinSliceCommand>();

  return http.post('/api/v1/test/commands/echo', async ({ request }) => {
    const idempotencyKey = request.headers.get('Idempotency-Key');
    const payload = (await request.json()) as { message?: unknown };
    const message =
      typeof payload.message === 'string' ? payload.message.trim() : '';

    if (
      !idempotencyKey?.match(/^[A-Za-z0-9._-]{8,128}$/) ||
      !message ||
      message.length > 240
    ) {
      return HttpResponse.json(
        {
          detail: 'Request validation failed.',
          errors: [{ field: 'message', message: 'Enter a message.' }],
          status: 400,
          title: 'Bad Request',
        },
        {
          status: 400,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    }

    const existing = commands.get(idempotencyKey);
    if (existing && existing.message !== message) {
      return HttpResponse.json(
        {
          detail: 'Idempotency-Key was already used with a different request.',
          errors: [],
          status: 409,
          title: 'Conflict',
        },
        {
          status: 409,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      );
    }
    if (existing) {
      return HttpResponse.json(existing, {
        headers: {
          'Cache-Control': 'no-store',
          'Idempotency-Replayed': 'true',
        },
      });
    }

    const command = {
      executionId: `thin-slice-${commands.size + 1}`,
      message,
      createdAt: '2026-08-15T00:00:00Z',
    };
    commands.set(idempotencyKey, command);
    return HttpResponse.json(command, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}

/** Stable API fixtures for frontend work that does not need a live Compose stack. */
export const handlers = [
  http.get('/api/v1/auth/session', () =>
    HttpResponse.json(
      {
        detail: 'Authentication is required.',
        errors: [],
        status: 401,
        title: 'Unauthorized',
      },
      {
        status: 401,
        headers: { 'Content-Type': 'application/problem+json' },
      },
    ),
  ),
  http.get('/api/v1/system/info', () =>
    HttpResponse.json({
      name: 'Odoc',
      status: 'ok',
      timestamp: '2026-08-15T00:00:00Z',
    }),
  ),
  http.get('/api/v1/spaces', () => HttpResponse.json([])),
  http.get('/api/v1/search', () => HttpResponse.json([])),
  createThinSliceCommandHandler(),
];
