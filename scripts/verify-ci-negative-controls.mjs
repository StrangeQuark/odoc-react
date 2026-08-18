import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fixtureDir = mkdtempSync(join(tmpdir(), 'odoc-react-ci-negative-'));
const failingTest = join(
  process.cwd(),
  'src',
  'test',
  'ci-negative-control.test.ts',
);

const expectFailure = (command, args) => {
  try {
    execFileSync(command, args, { cwd: process.cwd(), stdio: 'pipe' });
  } catch {
    return;
  }
  throw new Error(`Expected ${command} ${args.join(' ')} to fail.`);
};

try {
  const malformedSource = join(fixtureDir, 'malformed.ts');
  writeFileSync(
    malformedSource,
    'export const deliberatelyBad={value:1}\n',
    'utf8',
  );
  expectFailure('corepack', [
    'pnpm',
    'exec',
    'prettier',
    '--check',
    malformedSource,
  ]);

  writeFileSync(
    failingTest,
    "import { expect, test } from 'vitest'\n\ntest('CI negative control', () => expect(true).toBe(false))\n",
    'utf8',
  );
  expectFailure('corepack', ['pnpm', 'exec', 'vitest', 'run', failingTest]);

  execFileSync('corepack', ['pnpm', 'api:guard:proof'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  console.log(
    'Frontend negative CI controls passed: format, test, and contract failures were rejected.',
  );
} finally {
  rmSync(fixtureDir, { force: true, recursive: true });
  rmSync(failingTest, { force: true });
}
