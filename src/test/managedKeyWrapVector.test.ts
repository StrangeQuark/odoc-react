import { describe, expect, it } from 'vitest';
import vector from './fixtures/key-wrap-v1.json';

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

const unwrap = async (wrappedDek: Uint8Array) => {
  const kek = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(decodeBase64Url(vector.keyEncryptionKey)),
    'AES-KW',
    false,
    ['unwrapKey'],
  );
  const dek = await crypto.subtle.unwrapKey(
    'raw',
    toArrayBuffer(wrappedDek),
    kek,
    'AES-KW',
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt'],
  );
  return new Uint8Array(await crypto.subtle.exportKey('raw', dek));
};

describe('managed key-wrap interoperability vector', () => {
  it('unwraps the shared AES-KW vector and rejects a changed wrapped key', async () => {
    const wrappedDek = decodeBase64Url(vector.wrappedDek);

    await expect(unwrap(wrappedDek)).resolves.toEqual(
      decodeBase64Url(vector.plaintextDek),
    );

    const changedWrappedDek = wrappedDek.slice();
    changedWrappedDek[0] = (changedWrappedDek[0] ?? 0) ^ 1;
    await expect(unwrap(changedWrappedDek)).rejects.toBeDefined();
  });
});
