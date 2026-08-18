import { describe, expect, it } from 'vitest';
import vector from './fixtures/chunked-object-v1.json';

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

const key = () =>
  crypto.subtle.importKey(
    'raw',
    toArrayBuffer(decodeBase64Url(vector.keyMaterial)),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

const decrypt = async (nonce: Uint8Array, aad: string, ciphertext: string) =>
  new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(new TextEncoder().encode(aad)),
        tagLength: 128,
      },
      await key(),
      toArrayBuffer(decodeBase64Url(ciphertext)),
    ),
  );

const chunkAad = (index: number, scope = vector.securityScope) =>
  `odoc-chunk-v1|object=${vector.objectId}|index=${index}|count=${vector.chunkCount}|length=${vector.plaintextLength}|scope=${scope}|purpose=${vector.purpose}|version=${vector.version}|key=${vector.keyVersion}`;

const chunkNonce = (index: number) => {
  const nonce = new Uint8Array(12);
  nonce.set(decodeBase64Url(vector.noncePrefix));
  new DataView(nonce.buffer).setUint32(8, index, false);
  return nonce;
};

const decryptChunks = async (chunks = vector.chunks) => {
  if (chunks.length !== vector.chunkCount) {
    throw new Error('Chunk count does not match authenticated manifest.');
  }
  const plaintext = new Uint8Array(vector.plaintextLength);
  let offset = 0;
  for (const [expectedIndex, chunk] of chunks.entries()) {
    if (chunk.index !== expectedIndex) {
      throw new Error('Chunk sequence is not ordered.');
    }
    const part = await decrypt(
      chunkNonce(expectedIndex),
      chunkAad(expectedIndex),
      chunk.ciphertextAndTag,
    );
    plaintext.set(part, offset);
    offset += part.byteLength;
  }
  if (offset !== plaintext.byteLength) {
    throw new Error('Chunk plaintext length does not match manifest.');
  }
  return plaintext;
};

describe('managed chunked-object interoperability vector', () => {
  it('authenticates the manifest, supports a verified range, and rejects tampering', async () => {
    await expect(
      decrypt(
        decodeBase64Url(vector.manifestNonce),
        vector.manifestAad,
        vector.manifestCiphertextAndTag,
      ).then((bytes) => new TextDecoder().decode(bytes)),
    ).resolves.toBe(vector.manifestPlaintext);

    const plaintext = await decryptChunks();
    expect(new TextDecoder().decode(plaintext)).toBe(vector.plaintext);
    expect(new TextDecoder().decode(plaintext.slice(9, 22))).toBe(
      '9abcdefghijkl',
    );

    await expect(decryptChunks(vector.chunks.slice(0, -1))).rejects.toThrow(
      'Chunk count',
    );
    await expect(
      decrypt(chunkNonce(0), chunkAad(0), vector.chunks[1]!.ciphertextAndTag),
    ).rejects.toBeDefined();
    await expect(
      decrypt(
        chunkNonce(0),
        chunkAad(0, 'workspace:wrong-scope'),
        vector.chunks[0]!.ciphertextAndTag,
      ),
    ).rejects.toBeDefined();
  });
});
