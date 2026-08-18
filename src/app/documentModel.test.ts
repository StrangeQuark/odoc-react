import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_SCHEMA_VERSION,
  mediaValidationMessage,
  parseDocument,
  serialiseDocument,
} from './documentModel';

describe('document model', () => {
  it('preserves intentional legacy blank paragraphs', () => {
    const document = parseDocument('First paragraph\n\n\nSecond paragraph');

    expect(document.content).toHaveLength(4);
    expect(document.content?.[1]).toMatchObject({ type: 'paragraph' });
    expect(document.content?.[2]).toMatchObject({ type: 'paragraph' });
  });

  it('normalises existing image JSON into durable media metadata', () => {
    const document = parseDocument(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: {
              alt: 'Architecture diagram',
              src: '/api/v1/media/7be85c93-5a4c-4ce3-8c7e-b6d4c2b55e66',
              title: 'architecture.png',
            },
          },
        ],
      }),
    );

    expect(document.content?.[0]).toMatchObject({
      type: 'media',
      attrs: {
        align: 'center',
        alt: 'Architecture diagram',
        filename: 'architecture.png',
        mediaType: 'image',
        width: 'wide',
      },
    });
    expect(serialiseDocument(document)).not.toContain('blob:');
  });

  it('writes a versioned envelope and renders unknown nodes as safe fallback text', () => {
    const document = parseDocument(
      JSON.stringify({
        schemaVersion: 99,
        document: {
          type: 'doc',
          content: [
            {
              type: 'untrustedWidget',
              content: [{ type: 'text', text: 'Do not execute this' }],
            },
          ],
        },
      }),
    );

    expect(document.content?.[0]).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Do not execute this' }],
    });
    expect(JSON.parse(serialiseDocument(document))).toMatchObject({
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      document: { type: 'doc' },
    });
  });

  it('keeps allowlisted media presentation metadata through envelope serialisation', () => {
    const document = parseDocument(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'media',
            attrs: {
              assetId: 'asset-1',
              src: '/api/v1/media/asset-1',
              alt: 'Diagram',
              caption: 'Odoc architecture overview',
              align: 'right',
              width: 'small',
              ignoredAttribute: '<script>nope</script>',
            },
          },
        ],
      }),
    );

    expect(document.content?.[0]?.attrs).toMatchObject({
      caption: 'Odoc architecture overview',
      align: 'right',
      width: 'small',
    });
    expect(serialiseDocument(document)).not.toContain('ignoredAttribute');
  });

  it('round-trips a 10,000-block document through the versioned schema', () => {
    const source = {
      type: 'doc',
      content: Array.from({ length: 10_000 }, (_, index) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: `Block ${index}` }],
      })),
    };
    const startedAt = performance.now();
    const restored = parseDocument(serialiseDocument(source));

    expect(restored.content).toHaveLength(10_000);
    // This catches accidental quadratic traversal without hard-coding a
    // device-specific performance target into the product contract.
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });

  it('validates media choices before a network upload starts', () => {
    const tooLargeImage = new File(
      [new Uint8Array(10 * 1024 * 1024 + 1)],
      'large.png',
      { type: 'image/png' },
    );
    const unsupported = new File(['plain text'], 'notes.txt', {
      type: 'text/plain',
    });

    expect(mediaValidationMessage(tooLargeImage)).toMatch(/10 MB/);
    expect(mediaValidationMessage(unsupported)).toMatch(/PNG, JPEG/);
  });
});
