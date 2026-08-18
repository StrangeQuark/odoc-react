import { describe, expect, it } from 'vitest';

const toArrayBuffer = (value: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
};

describe('client-only encryption feasibility', () => {
  it('round-trips content with a non-extractable browser-held key', async () => {
    const workspaceKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const associatedData = new TextEncoder().encode(
      'odoc-zk-feasibility|workspace=opaque|epoch=1|purpose=page-content',
    );
    const plaintext = new TextEncoder().encode('opaque client-side document');

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(associatedData),
      },
      workspaceKey,
      toArrayBuffer(plaintext),
    );
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(associatedData),
      },
      workspaceKey,
      ciphertext,
    );

    await expect(
      crypto.subtle.exportKey('raw', workspaceKey),
    ).rejects.toBeDefined();
    expect(new TextDecoder().decode(decrypted)).toBe(
      'opaque client-side document',
    );
  });
});
