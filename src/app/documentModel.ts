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

/**
 * The persisted envelope is intentionally independent from a particular
 * Tiptap release. Phase 2 will validate and migrate this same format on the
 * server; keeping the version here now prevents editor extensions from
 * silently becoming a storage contract.
 */
export const DOCUMENT_SCHEMA_VERSION = 1;

type DocumentEnvelope = {
  schemaVersion: number;
  document: JSONContent;
};

const BLOCK_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'media',
]);

const ALLOWED_MARK_TYPES = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'highlight',
  'link',
]);

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

function plainText(node: JSONContent): string {
  const ownText = typeof node.text === 'string' ? node.text : '';
  return ownText + (node.content?.map(plainText).join('') ?? '');
}

function normaliseMarks(node: JSONContent): JSONContent['marks'] {
  return node.marks
    ?.filter((mark) => mark.type && ALLOWED_MARK_TYPES.has(mark.type))
    .flatMap((mark) => {
      if (mark.type !== 'link') return [mark];
      const href = mark.attrs?.href;
      if (typeof href !== 'string') return [];
      try {
        const protocol = new URL(href, 'https://odoc.invalid').protocol;
        return ['http:', 'https:', 'mailto:'].includes(protocol) ? [mark] : [];
      } catch {
        return [];
      }
    });
}

function mediaNode({
  assetId = null,
  src,
  alt = '',
  caption = '',
  align = 'center',
  filename = '',
  mediaType = 'image',
  width = 'wide',
}: {
  assetId?: string | null;
  src: string;
  alt?: string;
  caption?: string;
  align?: MediaAlign;
  filename?: string;
  mediaType?: MediaKind;
  width?: MediaWidth;
}): JSONContent {
  return {
    type: 'media',
    attrs: {
      assetId,
      src,
      alt,
      caption,
      align,
      mediaType,
      filename,
      uploading: false,
      uploadId: null,
      error: null,
      width,
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

function normaliseNode(node: JSONContent, parentIsBlock = false): JSONContent {
  if (node.type === 'doc') {
    return {
      type: 'doc',
      content: node.content?.map((child) => normaliseNode(child)),
    };
  }

  if (node.type === 'image') {
    const src = String(node.attrs?.src ?? '');
    return mediaNode({
      alt: String(node.attrs?.alt ?? ''),
      filename: String(node.attrs?.title ?? ''),
      src,
      assetId: src.match(/^\/api\/v1\/media\/([a-f0-9-]+)$/i)?.[1] ?? null,
    });
  }

  if (node.type === 'text') {
    return {
      type: 'text',
      text: typeof node.text === 'string' ? node.text : '',
      marks: normaliseMarks(node),
    };
  }

  if (node.type === 'hardBreak') return { type: 'hardBreak' };

  if (!node.type || !BLOCK_NODE_TYPES.has(node.type)) {
    const replacement = plainText(node).trim() || 'Unsupported content';
    return parentIsBlock
      ? { type: 'text', text: replacement }
      : paragraph(replacement);
  }

  if (node.type === 'media') {
    const attrs = node.attrs ?? {};
    const src = typeof attrs.src === 'string' ? attrs.src : '';
    return mediaNode({
      assetId: typeof attrs.assetId === 'string' ? attrs.assetId : null,
      src,
      alt: typeof attrs.alt === 'string' ? attrs.alt : '',
      caption: typeof attrs.caption === 'string' ? attrs.caption : '',
      align:
        attrs.align === 'left' || attrs.align === 'right'
          ? attrs.align
          : 'center',
      filename: typeof attrs.filename === 'string' ? attrs.filename : '',
      mediaType: attrs.mediaType === 'video' ? 'video' : 'image',
      width:
        attrs.width === 'small' ||
        attrs.width === 'medium' ||
        attrs.width === 'full'
          ? attrs.width
          : 'wide',
    });
  }

  const attrs = { ...(node.attrs ?? {}) };
  if (node.type === 'heading') {
    const level = Number(attrs.level);
    attrs.level =
      Number.isInteger(level) && level >= 1 && level <= 4 ? level : 1;
  }

  return {
    ...node,
    attrs: Object.keys(attrs).length ? attrs : undefined,
    content: node.content?.map((child) =>
      normaliseNode(child, BLOCK_NODE_TYPES.has(node.type ?? '')),
    ),
  };
}

/**
 * Reads both the early Markdown page format and the current versioned
 * Tiptap JSON representation. The server deliberately stores this as text
 * today, so the document itself stays portable through page history records.
 */
export function parseDocument(content: string): JSONContent {
  try {
    const parsed = JSON.parse(content) as JSONContent | DocumentEnvelope;
    const document =
      'document' in parsed && typeof parsed.schemaVersion === 'number'
        ? parsed.document
        : parsed;
    if (document.type === 'doc' && Array.isArray(document.content)) {
      return normaliseNode(document);
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
  const envelope: DocumentEnvelope = {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    document: normaliseNode(document),
  };
  return JSON.stringify(envelope);
}
