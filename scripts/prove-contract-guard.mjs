import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const contractPath = new URL('../openapi/odoc-v1.json', import.meta.url);
const original = await readFile(contractPath, 'utf8');

try {
  const mutated = JSON.stringify(
    {
      ...JSON.parse(original),
      info: {
        ...JSON.parse(original).info,
        title: 'Intentional contract guard proof — must not pass',
      },
    },
    null,
    2,
  );
  await writeFile(contractPath, `${mutated}\n`);

  const check = spawnSync(
    process.execPath,
    ['scripts/check-contract-manifest.mjs'],
    {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
    },
  );

  if (check.status === 0 || !check.stderr.includes('checksum drift')) {
    throw new Error(
      `Intentional OpenAPI mutation unexpectedly passed the contract guard. stderr=${check.stderr}`,
    );
  }
} finally {
  await writeFile(contractPath, original);
}

process.stdout.write(
  'Verified: an unmanifested OpenAPI change fails the contract guard.\n',
);
