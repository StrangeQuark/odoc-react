export type RuntimeConfig = {
  apiBasePath: string;
  release: string;
};

let cachedConfig: Promise<RuntimeConfig> | undefined;

export function getRuntimeConfig(): Promise<RuntimeConfig> {
  cachedConfig ??= fetch('/runtime-config.json', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Runtime configuration could not be loaded.');
      }

      return (await response.json()) as Partial<RuntimeConfig>;
    })
    .then((config) => {
      if (
        typeof config.apiBasePath !== 'string' ||
        !config.apiBasePath.startsWith('/api/')
      ) {
        throw new Error('Runtime configuration has an invalid API base path.');
      }

      return {
        apiBasePath: config.apiBasePath,
        release:
          typeof config.release === 'string' ? config.release : 'unknown',
      };
    });

  return cachedConfig;
}
