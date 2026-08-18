import { afterEach, describe, expect, it, vi } from 'vitest';

async function freshRuntimeConfig() {
  vi.resetModules();
  return import('./runtimeConfig');
}

describe('runtime configuration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects a deployment that supplies an invalid API boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ apiBasePath: 'https://api.example.test' }),
          ),
        ),
    );
    const { getRuntimeConfig } = await freshRuntimeConfig();

    await expect(getRuntimeConfig()).rejects.toThrow(
      'Runtime configuration has an invalid API base path.',
    );
  });

  it('loads public configuration once and opts it out of browser caching', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ apiBasePath: '/api/v1', release: 'test-release' }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { getRuntimeConfig } = await freshRuntimeConfig();

    await expect(getRuntimeConfig()).resolves.toEqual({
      apiBasePath: '/api/v1',
      release: 'test-release',
    });
    await expect(getRuntimeConfig()).resolves.toEqual({
      apiBasePath: '/api/v1',
      release: 'test-release',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/runtime-config.json', {
      cache: 'no-store',
    });
  });
});
