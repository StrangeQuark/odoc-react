/* eslint-disable react-refresh/only-export-components -- Tiptap node factories must share the React node view. */
import { Node, mergeAttributes, type JSONContent } from '@tiptap/core';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useState,
} from 'react';
import { fetchAuthenticatedMedia, type Credentials } from '../shared/api';
import type { MediaAlign, MediaKind, MediaWidth } from './documentModel';

export type MediaNodeAttributes = {
  assetId: string | null;
  align: MediaAlign;
  alt: string;
  caption: string;
  contentType: string;
  error: string | null;
  filename: string;
  mediaType: MediaKind;
  src: string;
  uploading: boolean;
  uploadId: string | null;
  width: MediaWidth;
};

type MediaExtensionOptions = {
  credentials?: Credentials;
  editable: boolean;
  onRemoveMedia?: (assetId: string) => void;
  onRemoveUpload?: (uploadId: string) => void;
  onRetry?: (uploadId: string) => void;
};

const MEDIA_WIDTHS: Array<{ label: string; value: MediaWidth }> = [
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Wide', value: 'wide' },
  { label: 'Full width', value: 'full' },
];

function attrs(node: NodeViewProps['node']): MediaNodeAttributes {
  return {
    assetId: node.attrs.assetId ? String(node.attrs.assetId) : null,
    align:
      node.attrs.align === 'left' || node.attrs.align === 'right'
        ? node.attrs.align
        : 'center',
    alt: String(node.attrs.alt ?? ''),
    caption: String(node.attrs.caption ?? ''),
    contentType: String(node.attrs.contentType ?? ''),
    error: node.attrs.error ? String(node.attrs.error) : null,
    filename: String(node.attrs.filename ?? ''),
    mediaType: node.attrs.mediaType === 'video' ? 'video' : 'image',
    src: String(node.attrs.src ?? ''),
    uploading: Boolean(node.attrs.uploading),
    uploadId: node.attrs.uploadId ? String(node.attrs.uploadId) : null,
    width: ['small', 'medium', 'wide', 'full'].includes(
      String(node.attrs.width),
    )
      ? (node.attrs.width as MediaWidth)
      : 'wide',
  };
}

function MediaNodeView({
  node,
  selected,
  updateAttributes,
  deleteNode,
  editor,
  getPos,
  credentials,
  editable,
  onRemoveMedia,
  onRemoveUpload,
  onRetry,
}: NodeViewProps & MediaExtensionOptions) {
  const media = attrs(node);
  const isAuthenticatedMedia = media.src.startsWith('/api/v1/media/');
  const [authenticatedMedia, setAuthenticatedMedia] = useState<{
    path: string;
    source: string;
  } | null>(null);
  const source = isAuthenticatedMedia
    ? authenticatedMedia?.path === media.src
      ? authenticatedMedia.source
      : null
    : null;

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const abortController = new AbortController();

    if (!isAuthenticatedMedia || !credentials) return undefined;

    void fetchAuthenticatedMedia(credentials, media.src, abortController.signal)
      .then((blob) => {
        const nextObjectUrl = URL.createObjectURL(blob);
        if (active) {
          objectUrl = nextObjectUrl;
          setAuthenticatedMedia({ path: media.src, source: nextObjectUrl });
        } else {
          URL.revokeObjectURL(nextObjectUrl);
        }
      })
      .catch((error: unknown) => {
        if (
          active &&
          !(error instanceof DOMException && error.name === 'AbortError')
        ) {
          setAuthenticatedMedia(null);
        }
      });

    return () => {
      active = false;
      abortController.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [credentials, isAuthenticatedMedia, media.src]);

  const update = (next: Partial<MediaNodeAttributes>) => updateAttributes(next);
  const canMove = (direction: -1 | 1) => {
    const position = getPos();
    if (position === undefined) return false;
    const resolvedPosition = editor.state.doc.resolve(position);
    const siblingIndex = resolvedPosition.index() + direction;
    return (
      siblingIndex >= 0 && siblingIndex < resolvedPosition.parent.childCount
    );
  };
  const moveMedia = (direction: -1 | 1) => {
    const position = getPos();
    if (position === undefined) return;

    const state = editor.state;
    const resolvedPosition = state.doc.resolve(position);
    const currentIndex = resolvedPosition.index();
    const parent = resolvedPosition.parent;
    const currentNode = parent.maybeChild(currentIndex);
    const sibling = parent.maybeChild(currentIndex + direction);
    if (!currentNode || currentNode.type.name !== 'media' || !sibling) return;

    // Moving the node as a single transaction preserves its metadata and makes
    // the action undoable. The insertion position is calculated against the
    // post-delete document: before the previous sibling when moving up, after
    // the next sibling when moving down.
    const nextPosition =
      direction < 0 ? position - sibling.nodeSize : position + sibling.nodeSize;
    const transaction = state.tr
      .delete(position, position + currentNode.nodeSize)
      .insert(nextPosition, currentNode)
      .scrollIntoView();
    editor.view.dispatch(transaction);
    editor.chain().focus().setNodeSelection(nextPosition).run();
  };
  const handleMediaKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!editable || !selected || !event.altKey) return;
    if (event.key === 'ArrowUp' && canMove(-1)) {
      event.preventDefault();
      moveMedia(-1);
    }
    if (event.key === 'ArrowDown' && canMove(1)) {
      event.preventDefault();
      moveMedia(1);
    }
  };
  const name =
    media.caption || media.alt || media.filename || `${media.mediaType} upload`;

  return (
    <NodeViewWrapper
      as="figure"
      className={`document-media document-media--${media.align} document-media--${media.width} ${selected ? 'is-selected' : ''}`}
      data-media-kind={media.mediaType}
      data-uploading={media.uploading || undefined}
      aria-keyshortcuts={editable ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
      onKeyDown={handleMediaKeyDown}
    >
      <div className="document-media-frame">
        {editable && (
          <span
            className="document-media-drag-handle"
            data-drag-handle
            title="Drag to move media"
          >
            ⠿
          </span>
        )}
        {media.uploading ? (
          <div className="document-media-uploading" role="status">
            <span>Uploading {media.filename || media.mediaType}…</span>
          </div>
        ) : source ? (
          media.mediaType === 'video' ? (
            <video
              controls
              preload="metadata"
              src={source}
              aria-label={`Video: ${name}`}
            />
          ) : (
            <img src={source} alt={media.alt} />
          )
        ) : (
          <div className="document-media-unavailable" role="status">
            {media.error || `This ${media.mediaType} is unavailable.`}
          </div>
        )}
      </div>

      {(media.caption || editable) && (
        <figcaption>
          {editable ? (
            <input
              aria-label="Media caption"
              placeholder="Add a caption"
              value={media.caption}
              onChange={(event) => update({ caption: event.target.value })}
            />
          ) : (
            media.caption
          )}
        </figcaption>
      )}

      {editable && (selected || media.uploading || media.error) && (
        <div className="document-media-controls" aria-label="Media controls">
          <label>
            {media.mediaType === 'image' ? 'Alt text' : 'Video description'}
            <input
              aria-label={
                media.mediaType === 'image'
                  ? 'Image alt text'
                  : 'Video description'
              }
              placeholder={
                media.mediaType === 'image'
                  ? 'Describe this image'
                  : 'Describe this video'
              }
              value={media.alt}
              onChange={(event) => update({ alt: event.target.value })}
            />
          </label>
          <div
            className="media-control-group"
            role="group"
            aria-label="Media alignment"
          >
            {(['left', 'center', 'right'] as MediaAlign[]).map((align) => (
              <button
                key={align}
                type="button"
                className={media.align === align ? 'active' : ''}
                aria-pressed={media.align === align}
                onClick={() => update({ align })}
              >
                {align[0]?.toUpperCase() + align.slice(1)}
              </button>
            ))}
          </div>
          <div
            className="media-control-group"
            role="group"
            aria-label="Media width"
          >
            {MEDIA_WIDTHS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                className={media.width === value ? 'active' : ''}
                aria-pressed={media.width === value}
                onClick={() => update({ width: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className="media-control-group"
            role="group"
            aria-label="Move media"
          >
            <button
              type="button"
              aria-label="Move media up"
              title="Move media up (Alt+Up)"
              disabled={!canMove(-1)}
              onClick={() => moveMedia(-1)}
            >
              Move up
            </button>
            <button
              type="button"
              aria-label="Move media down"
              title="Move media down (Alt+Down)"
              disabled={!canMove(1)}
              onClick={() => moveMedia(1)}
            >
              Move down
            </button>
          </div>
          {media.error && media.uploadId && (
            <button type="button" onClick={() => onRetry?.(media.uploadId!)}>
              Retry upload
            </button>
          )}
          <button
            type="button"
            className="danger-text"
            onClick={() => {
              if (media.uploadId) onRemoveUpload?.(media.uploadId);
              if (media.assetId) onRemoveMedia?.(media.assetId);
              deleteNode();
            }}
          >
            Remove media
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

const Media = Node.create<MediaExtensionOptions>({
  name: 'media',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { editable: false };
  },

  addAttributes() {
    return {
      assetId: { default: null },
      align: { default: 'center' },
      alt: { default: '' },
      caption: { default: '' },
      contentType: { default: '' },
      error: { default: null },
      filename: { default: '' },
      mediaType: { default: 'image' },
      src: { default: '' },
      uploading: { default: false },
      uploadId: { default: null },
      width: { default: 'wide' },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-odoc-media]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, { 'data-odoc-media': '' }),
    ];
  },

  addNodeView() {
    const options = this.options;
    return ReactNodeViewRenderer(
      (props) => <MediaNodeView {...props} {...options} />,
      {
        // This outer wrapper is the direct ProseMirror child. Carry layout
        // metadata here so a complete media node can be floated safely.
        attrs: ({ node }) => ({
          'data-media-align': String(node.attrs.align ?? 'center'),
          'data-media-kind': String(node.attrs.mediaType ?? 'image'),
          'data-media-width': String(node.attrs.width ?? 'wide'),
        }),
        className: 'odoc-media-node',
      },
    );
  },
});

export function createMediaExtension(options: MediaExtensionOptions) {
  return Media.configure(options);
}

export function pendingMediaNode({
  filename,
  mediaType,
  uploadId,
}: {
  filename: string;
  mediaType: MediaKind;
  uploadId: string;
}): JSONContent {
  return {
    type: 'media',
    attrs: {
      assetId: null,
      alt: '',
      caption: '',
      contentType: '',
      error: null,
      filename,
      mediaType,
      src: '',
      uploading: true,
      uploadId,
      width: 'wide',
      align: 'center',
    },
  };
}
