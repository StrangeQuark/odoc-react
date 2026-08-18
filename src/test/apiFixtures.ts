import { HttpResponse, type JsonBodyType } from 'msw';

/** The standard states every feature fixture can express without ad hoc errors. */
export type ResourceFixtureState =
  | 'loading'
  | 'empty'
  | 'success'
  | 'validation'
  | 'unauthenticated'
  | 'forbidden'
  | 'missing'
  | 'conflict'
  | 'rate-limited'
  | 'network-failure'
  | 'server-failure';

export type ProblemFixtureState = Exclude<
  ResourceFixtureState,
  'loading' | 'empty' | 'success' | 'network-failure'
>;

type ProblemFixture = {
  detail: string;
  status: number;
  title: string;
  type: string;
};

const problems: Record<ProblemFixtureState, ProblemFixture> = {
  validation: {
    type: 'https://odoc.local/problems/validation',
    title: 'Validation failed',
    status: 400,
    detail: 'One or more fields need attention.',
  },
  unauthenticated: {
    type: 'https://odoc.local/problems/unauthenticated',
    title: 'Authentication required',
    status: 401,
    detail: 'Sign in and try again.',
  },
  forbidden: {
    type: 'https://odoc.local/problems/forbidden',
    title: 'Access denied',
    status: 403,
    detail: 'You do not have permission for this resource.',
  },
  missing: {
    type: 'https://odoc.local/problems/not-found',
    title: 'Not found',
    status: 404,
    detail: 'The resource no longer exists.',
  },
  conflict: {
    type: 'https://odoc.local/problems/conflict',
    title: 'Conflict',
    status: 409,
    detail: 'This resource changed while you were editing it.',
  },
  'rate-limited': {
    type: 'https://odoc.local/problems/rate-limited',
    title: 'Too many requests',
    status: 429,
    detail: 'Wait briefly before retrying.',
  },
  'server-failure': {
    type: 'https://odoc.local/problems/internal',
    title: 'Unexpected server error',
    status: 500,
    detail: 'Try again later.',
  },
};

/**
 * Returns an RFC 9457-shaped response for any standard failure fixture. Use
 * `pendingFixture()` for loading and `HttpResponse.json([])` for empty lists.
 */
export function problemFixture(state: ProblemFixtureState) {
  const problem = problems[state];
  return HttpResponse.json(problem, {
    status: problem.status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

/** A successful JSON resource fixture. */
export function successFixture<T extends JsonBodyType>(resource: T) {
  return HttpResponse.json(resource);
}

/** A successful empty collection fixture. */
export function emptyFixture() {
  return HttpResponse.json([]);
}

/** A deliberately unresolved MSW response used to assert loading UI safely. */
export function pendingFixture(): Promise<never> {
  return new Promise(() => {});
}

/** Simulates a transport failure rather than an HTTP Problem response. */
export function networkFailureFixture() {
  return HttpResponse.error();
}
