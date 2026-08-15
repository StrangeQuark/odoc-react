import type { JSONContent } from '@tiptap/core';

export type MediaKind = 'image' | 'video';
export type MediaAlign = 'left' | 'center' | 'right';
export type MediaWidth = 'small' | 'medium' | 'wide' | 'full';

export const ACCEPTED_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/ogg',
] as const;

export const MEDIA_FILE_ACCEPT = ACCEPTED_MEDIA_TYPES.join(',');
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 25 * 1024 * 1024;

export function mediaKindForContentType(contentType: string): MediaKind | null {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  return null;
}

export function isAcceptedMediaFile(file: File): boolean {
  return ACCEPTED_MEDIA_TYPES.includes(
    file.type as (typeof ACCEPTED_MEDIA_TYPES)[number],
  );
}

export function mediaValidationMessage(file: File): string | null {
  const kind = mediaKindForContentType(file.type);
  if (!kind || !isAcceptedMediaFile(file)) {
    return 'Choose a PNG, JPEG, GIF, WebP, AVIF, MP4, WebM, or Ogg media file.';
  }
  const limit =
    kind === 'image' ? MAX_IMAGE_UPLOAD_BYTES : MAX_VIDEO_UPLOAD_BYTES;
  if (file.size > limit) {
    return `${kind === 'image' ? 'Images' : 'Videos'} must be ${Math.floor(limit / 1024 / 1024)} MB or smaller.`;
  }
  return null;
}

function textNode(text: string): JSONContent[] | undefined {
  return text ? [{ type: 'text', text }] : undefined;
}

function paragraph(text = ''): JSONContent {
  return { type: 'paragraph', content: textNode(text) };
}

function mediaNode({
  assetId = null,
  src,
  alt = '',
  filename = '',
  mediaType = 'image',
}: {
  assetId?: string | null;
  src: string;
  alt?: string;
  filename?: string;
  mediaType?: MediaKind;
}): JSONContent {
  return {
    type: 'media',
    attrs: {
      assetId,
      src,
      alt,
      caption: '',
      align: 'center',
      mediaType,
      filename,
      uploading: false,
      uploadId: null,
      error: null,
      width: 'wide',
    },
  };
}

function legacyMarkdownToDocument(markdown: string): JSONContent {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const content: JSONContent[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const image = line.match(
      /^!\[([^\]]*)\]\((\/api\/v1\/media\/[a-f0-9-]+)\)$/i,
    );
    const heading = line.match(/^(#{1,4})\s+(.+)$/);

    if (line.startsWith('```')) {
      const language = line.slice(3).trim() || null;
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      content.push({
        type: 'codeBlock',
        attrs: { language },
        content: textNode(codeLines.join('\n')),
      });
      continue;
    }

    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: heading[1]?.length ?? 1 },
        content: textNode(heading[2] ?? ''),
      });
      continue;
    }

    if (image) {
      const src = image[2] ?? '';
      content.push(
        mediaNode({
          assetId: src.match(/^\/api\/v1\/media\/([a-f0-9-]+)$/i)?.[1] ?? null,
          src,
          alt: image[1] ?? '',
          filename: '',
        }),
      );
      continue;
    }

    if (line.startsWith('- ')) {
      const items: JSONContent[] = [];
      while (index < lines.length && (lines[index] ?? '').startsWith('- ')) {
        items.push({
          type: 'listItem',
          content: [paragraph((lines[index] ?? '').slice(2))],
        });
        index += 1;
      }
      index -= 1;
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      const items: JSONContent[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? '').match(/^\d+\.\s+(.+)$/);
        if (!item) break;
        items.push({ type: 'listItem', content: [paragraph(item[1] ?? '')] });
        index += 1;
      }
      index -= 1;
      content.push({ type: 'orderedList', content: items });
      continue;
    }

    if (line.startsWith('> ')) {
      content.push({ type: 'blockquote', content: [paragraph(line.slice(2))] });
      continue;
    }

    content.push(paragraph(line));
  }

  return { type: 'doc', content: content.length ? content : [paragraph()] };
}

function normaliseNode(node: JSONContent): JSONContent {
  if (node.type === 'image') {
    const src = String(node.attrs?.src ?? '');
    return mediaNode({
      alt: String(node.attrs?.alt ?? ''),
      filename: String(node.attrs?.title ?? ''),
      src,
      assetId: src.match(/^\/api\/v1\/media\/([a-f0-9-]+)$/i)?.[1] ?? null,
    });
  }

  return {
    ...node,
    content: node.content?.map(normaliseNode),
  };
}

/**
 * Reads both the early Markdown page format and the current versioned
 * Tiptap JSON representation. The server deliberately stores this as text
 * today, so the document itself stays portable through page history records.
 */
export function parseDocument(content: string): JSONContent {
  try {
    const parsed = JSON.parse(content) as JSONContent;
    if (parsed.type === 'doc' && Array.isArray(parsed.content)) {
      return normaliseNode(parsed);
    }
  } catch {
    // Legacy Markdown is intentionally converted client-side during the MVP migration.
  }
  return legacyMarkdownToDocument(content);
}

export function emptyDocument(): JSONContent {
  return { type: 'doc', content: [paragraph()] };
}

export function serialiseDocument(document: JSONContent): string {
  return JSON.stringify(document);
}
