import { describe, expect, it } from 'vitest';
import {
  emptyFixture,
  networkFailureFixture,
  pendingFixture,
  problemFixture,
  successFixture,
  type ProblemFixtureState,
} from './apiFixtures';

describe('standard API fixtures', () => {
  const problemStates: ProblemFixtureState[] = [
    'validation',
    'unauthenticated',
    'forbidden',
    'missing',
    'conflict',
    'rate-limited',
    'server-failure',
  ];

  it.each(problemStates)(
    'creates a problem-details response for %s',
    async (state) => {
      const response = problemFixture(state);
      const body = (await response.json()) as { status: number; title: string };

      expect(response.status).toBe(body.status);
      expect(response.headers.get('content-type')).toContain(
        'application/problem+json',
      );
      expect(body.title).not.toBe('');
    },
  );

  it('expresses loading, empty, and successful resource states', async () => {
    const pending = pendingFixture();
    const empty = emptyFixture();
    const success = successFixture({ id: 'space-1' });

    expect(pending).toBeInstanceOf(Promise);
    await expect(empty.json()).resolves.toEqual([]);
    await expect(success.json()).resolves.toEqual({ id: 'space-1' });
  });

  it('keeps transport failure distinct from an HTTP response', () => {
    expect(networkFailureFixture().type).toBe('error');
  });
});
