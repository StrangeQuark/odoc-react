import { describe, expect, it } from 'vitest';
import vector from './fixtures/zero-knowledge-capability-manifest-v1.json';

const decodeBase64 = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return decodeBase64(
    normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='),
  );
};

const toArrayBuffer = (value: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
};

const verify = async (payload: Uint8Array) => {
  const key = await crypto.subtle.importKey(
    'spki',
    toArrayBuffer(decodeBase64(vector.publicKeySpkiBase64)),
    { name: 'Ed25519' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    { name: 'Ed25519' },
    key,
    toArrayBuffer(decodeBase64Url(vector.signatureBase64Url)),
    toArrayBuffer(payload),
  );
};

describe('zero-knowledge capability-manifest feasibility vector', () => {
  it('verifies the signed cross-runtime test manifest and rejects tampering', async () => {
    expect(vector.manifest.signature).toBe(vector.signatureBase64Url);
    const payload = new TextEncoder().encode(vector.canonicalPayload);

    await expect(verify(payload)).resolves.toBe(true);

    const tampered = payload.slice();
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    await expect(verify(tampered)).resolves.toBe(false);
  });
});
