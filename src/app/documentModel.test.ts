import { describe, expect, it } from 'vitest';
import {
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
