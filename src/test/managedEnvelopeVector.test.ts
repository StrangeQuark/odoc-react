import { describe, expect, it } from 'vitest';
import vector from './fixtures/envelope-v1.json';

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const toArrayBuffer = (value: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
};

const decrypt = async (
  additionalData: Uint8Array,
  ciphertextAndTag: Uint8Array,
) => {
  const key = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(decodeBase64Url(vector.keyMaterial)),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(decodeBase64Url(vector.nonce)),
      additionalData: toArrayBuffer(additionalData),
      tagLength: 128,
    },
    key,
    toArrayBuffer(ciphertextAndTag),
  );
  return new TextDecoder().decode(plaintext);
};

describe('managed envelope interoperability vector', () => {
  it('decrypts the shared vector and rejects changed AAD or ciphertext', async () => {
    const encoder = new TextEncoder();
    const aad = encoder.encode(vector.associatedData);
    const ciphertextAndTag = decodeBase64Url(vector.ciphertextAndTag);

    await expect(decrypt(aad, ciphertextAndTag)).resolves.toBe(
      vector.plaintext,
    );

    const changedAad = aad.slice();
    changedAad[0] = (changedAad[0] ?? 0) ^ 1;
    await expect(decrypt(changedAad, ciphertextAndTag)).rejects.toBeDefined();

    const changedCiphertext = ciphertextAndTag.slice();
    changedCiphertext[0] = (changedCiphertext[0] ?? 0) ^ 1;
    await expect(decrypt(aad, changedCiphertext)).rejects.toBeDefined();
  });
});
