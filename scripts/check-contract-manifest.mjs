import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const contractPath = new URL('../openapi/odoc-v1.json', import.meta.url);
const manifestPath = new URL(
  '../openapi/contract-manifest.json',
  import.meta.url,
);
const metadataPath = new URL(
  '../src/shared/api/contractMetadata.ts',
  import.meta.url,
);

const [contract, manifestSource, metadata] = await Promise.all([
  readFile(contractPath),
  readFile(manifestPath, 'utf8'),
  readFile(metadataPath, 'utf8'),
]);
const manifest = JSON.parse(manifestSource);
const actualSha256 = createHash('sha256').update(contract).digest('hex');

if (
  typeof manifest.contractVersion !== 'string' ||
  !/^v\d+$/.test(manifest.contractVersion) ||
  typeof manifest.sha256 !== 'string' ||
  !/^[a-f0-9]{64}$/.test(manifest.sha256)
) {
  throw new Error(
    'OpenAPI contract manifest has an invalid version or SHA-256.',
  );
}
if (manifest.sha256 !== actualSha256) {
  throw new Error(
    `OpenAPI contract checksum drift: manifest=${manifest.sha256} actual=${actualSha256}`,
  );
}
if (
  !metadata.includes(`version: '${manifest.contractVersion}'`) ||
  !metadata.includes(`sha256: '${manifest.sha256}'`)
) {
  throw new Error(
    'Generated contract metadata does not match openapi/contract-manifest.json.',
  );
}
