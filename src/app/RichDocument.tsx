import { Extension, type Editor } from '@tiptap/core';
import FileHandler from '@tiptap/extension-file-handler';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { type Credentials, type MediaAsset } from '../shared/api';
import {
  MEDIA_FILE_ACCEPT,
  isAcceptedMediaFile,
  mediaKindForContentType,
  mediaValidationMessage,
  parseDocument,
  serialiseDocument,
} from './documentModel';
import { createMediaExtension, pendingMediaNode } from './MediaNode';

type RichDocumentProps = {
  content: string;
  credentials: Credentials;
};

export type RichTextEditorController = {
  discardUnpublishedAssets: () => void;
  getContent: () => string;
  hasActiveUploads: () => boolean;
  markPublished: () => void;
};

type RichTextEditorProps = RichDocumentProps & {
  onChange: (content: string) => void;
  onControllerChange?: (controller: RichTextEditorController | null) => void;
  onDeleteMedia: (assetId: string) => Promise<void>;
  onUploadCountChange?: (count: number) => void;
  onUpload: (file: File) => Promise<MediaAsset>;
};

type MediaUpload = {
  file: File;
};

const TabBehavior = Extension.create({
  name: 'odocTabBehavior',
  priority: 110,

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('table')) return false;
        if (this.editor.isActive('listItem')) {
          // A top-level first item cannot be nested, but it should still keep
          // keyboard focus in the document instead of handing Tab to the page.
          return (
            this.editor.commands.sinkListItem('listItem') ||
            this.editor.commands.insertContent('\t')
          );
        }
        if (this.editor.isActive('taskItem')) {
          return (
            this.editor.commands.sinkListItem('taskItem') ||
            this.editor.commands.insertContent('\t')
          );
        }
        return this.editor.commands.insertContent('\t');
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('table')) return false;
        if (this.editor.isActive('listItem')) {
          this.editor.commands.liftListItem('listItem');
          return true;
        }
        if (this.editor.isActive('taskItem')) {
          this.editor.commands.liftListItem('taskItem');
          return true;
        }
        if (this.editor.isActive('codeBlock')) {
          return this.editor.commands.insertContent('\t');
        }
        return false;
      },
    };
  },
});

function isSafeLink(value: string): boolean {
  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function createExtensions({
  credentials,
  editable,
  onMediaFiles,
  onRemoveMedia,
  onRemoveUpload,
  onRetry,
}: {
  credentials: Credentials;
  editable: boolean;
  onMediaFiles?: (files: File[], position?: number) => void;
  onRemoveMedia?: (assetId: string) => void;
  onRemoveUpload?: (uploadId: string) => void;
  onRetry?: (uploadId: string) => void;
}) {
  const extensions = [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
    Underline,
    Highlight.configure({ multicolor: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextAlign.configure({
      alignments: ['left', 'center', 'right'],
      types: ['heading', 'paragraph'],
    }),
    Link.configure({
      autolink: true,
      defaultProtocol: 'https',
      HTMLAttributes: { rel: 'noopener noreferrer' },
      openOnClick: !editable,
    }),
    createMediaExtension({
      credentials,
      editable,
      onRemoveMedia,
      onRemoveUpload,
      onRetry,
    }),
    Table.configure({ resizable: editable }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder: 'Start writing…' }),
    TabBehavior,
  ];

  if (editable && onMediaFiles) {
    extensions.push(
      FileHandler.configure({
        allowedMimeTypes: MEDIA_FILE_ACCEPT.split(','),
        consumePasteEvent: true,
        onDrop: (_editor, files, position) => onMediaFiles(files, position),
        onPaste: (_editor, files) => onMediaFiles(files),
      }),
    );
  }

  return extensions;
}

function formatWordCount(text: string): string {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return `${words} ${words === 1 ? 'word' : 'words'}`;
}

export function RichDocument({ content, credentials }: RichDocumentProps) {
  const document = useMemo(() => parseDocument(content), [content]);
  const extensions = useMemo(
    () => createExtensions({ credentials, editable: false }),
    [credentials],
  );
  const editor = useEditor({
    content: document,
    editable: false,
    extensions,
    immediatelyRender: false,
  });

  useEffect(() => {
    editor?.commands.setContent(document, { emitUpdate: false });
  }, [document, editor]);

  return <EditorContent editor={editor} className="tiptap-content" />;
}

export function RichTextEditor({
  content,
  credentials,
  onChange,
  onControllerChange,
  onDeleteMedia,
  onUploadCountChange,
  onUpload,
}: RichTextEditorProps) {
  const [initialDocument] = useState(() => parseDocument(content));
  const editorRef = useRef<Editor | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastExternalContent = useRef(content);
  const uploads = useRef(new Map<string, MediaUpload>());
  const createdAssets = useRef(new Set<string>());
  const activeUploadsRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const onDeleteMediaRef = useRef(onDeleteMedia);
  const onUploadRef = useRef(onUpload);
  const [activeUploads, setActiveUploads] = useState(0);
  const [dropActive, setDropActive] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [uploadError, setUploadError] = useState<string>();

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onUploadRef.current = onUpload;
  }, [onUpload]);

  useEffect(() => {
    onDeleteMediaRef.current = onDeleteMedia;
  }, [onDeleteMedia]);

  useEffect(() => {
    onUploadCountChange?.(activeUploads);
  }, [activeUploads, onUploadCountChange]);

  const updatePendingMedia = useCallback(
    (uploadId: string, attributes: Record<string, unknown>) => {
      const currentEditor = editorRef.current;
      if (!currentEditor) return false;
      return currentEditor.commands.command(({ state, tr }) => {
        let position: number | null = null;
        let mediaAttrs: Record<string, unknown> | undefined;
        state.doc.descendants((node, pos) => {
          if (node.type.name === 'media' && node.attrs.uploadId === uploadId) {
            position = pos;
            mediaAttrs = { ...node.attrs };
            return false;
          }
          return true;
        });
        if (position === null || mediaAttrs === undefined) return false;
        tr.setNodeMarkup(
          position,
          undefined,
          Object.assign({}, mediaAttrs, attributes),
        );
        return true;
      });
    },
    [],
  );

  const releaseUpload = useCallback((uploadId: string) => {
    uploads.current.delete(uploadId);
  }, []);

  const deleteUnusedAsset = useCallback((assetId: string) => {
    void onDeleteMediaRef.current(assetId).catch(() => {
      setUploadError(
        'This unused upload could not be cleaned up. It will be retried by the server cleanup job.',
      );
    });
  }, []);

  const cleanUpCreatedAsset = useCallback(
    (assetId: string) => {
      if (!createdAssets.current.delete(assetId)) return;
      deleteUnusedAsset(assetId);
    },
    [deleteUnusedAsset],
  );

  const discardUnpublishedAssets = useCallback(() => {
    [...createdAssets.current].forEach(cleanUpCreatedAsset);
  }, [cleanUpCreatedAsset]);

  const performUpload = useCallback(
    async (uploadId: string) => {
      const pending = uploads.current.get(uploadId);
      if (!pending) return;
      activeUploadsRef.current += 1;
      setActiveUploads((count) => count + 1);
      setUploadError(undefined);
      updatePendingMedia(uploadId, { error: null, uploading: true });
      try {
        const asset = await onUploadRef.current(pending.file);
        const kind = mediaKindForContentType(asset.contentType);
        if (!kind)
          throw new Error('The server returned an unsupported media type.');
        const wasInserted = updatePendingMedia(uploadId, {
          assetId: asset.id,
          contentType: asset.contentType,
          error: null,
          filename: asset.filename,
          mediaType: kind,
          src: asset.url,
          uploading: false,
          uploadId: null,
        });
        if (wasInserted) createdAssets.current.add(asset.id);
        else deleteUnusedAsset(asset.id);
        releaseUpload(uploadId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not upload media.';
        updatePendingMedia(uploadId, { error: message, uploading: false });
        setUploadError(message);
      } finally {
        activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
        setActiveUploads((count) => Math.max(0, count - 1));
      }
    },
    [deleteUnusedAsset, releaseUpload, updatePendingMedia],
  );

  const queueFiles = useCallback(
    (files: File[], position?: number) => {
      const currentEditor = editorRef.current;
      if (!currentEditor) return;
      const accepted = files.filter(isAcceptedMediaFile);
      const rejected = files.find((file) => mediaValidationMessage(file));
      if (rejected)
        setUploadError(mediaValidationMessage(rejected) ?? undefined);
      if (!accepted.length) return;

      [...accepted].reverse().forEach((file) => {
        const validation = mediaValidationMessage(file);
        const mediaType = mediaKindForContentType(file.type);
        if (validation || !mediaType) {
          setUploadError(validation ?? 'Unsupported media file.');
          return;
        }
        const uploadId = crypto.randomUUID();
        uploads.current.set(uploadId, { file });
        // ProseMirror returns 0 when a synthetic/edge drop has no resolvable
        // coordinates. A zero position is not a valid block insertion point;
        // use the current selection rather than silently dropping the asset.
        const insertAt =
          position && position > 0
            ? position
            : currentEditor.state.selection.from;
        currentEditor
          .chain()
          .focus()
          .insertContentAt(
            insertAt,
            pendingMediaNode({
              filename: file.name,
              mediaType,
              uploadId,
            }),
          )
          .run();
        void performUpload(uploadId);
      });
    },
    [performUpload],
  );

  const extensions = useMemo(() => {
    // The callbacks are registered here but only access refs from editor events.
    // eslint-disable-next-line react-hooks/refs
    return createExtensions({
      credentials,
      editable: true,
      onMediaFiles: queueFiles,
      onRemoveMedia: cleanUpCreatedAsset,
      onRemoveUpload: releaseUpload,
      onRetry: (uploadId) => void performUpload(uploadId),
    });
  }, [
    cleanUpCreatedAsset,
    credentials,
    performUpload,
    queueFiles,
    releaseUpload,
  ]);

  const editor = useEditor({
    content: initialDocument,
    editorProps: {
      attributes: {
        'aria-label': 'Document content',
        'aria-multiline': 'true',
        role: 'textbox',
      },
    },
    extensions,
    immediatelyRender: false,
    onCreate: ({ editor: createdEditor }) => {
      editorRef.current = createdEditor;
      onControllerChange?.({
        discardUnpublishedAssets,
        getContent: () => serialiseDocument(createdEditor.getJSON()),
        hasActiveUploads: () => activeUploadsRef.current > 0,
        markPublished: () => createdAssets.current.clear(),
      });
    },
    onDestroy: () => {
      discardUnpublishedAssets();
      editorRef.current = null;
      onControllerChange?.(null);
    },
    onUpdate: ({ editor: updatedEditor }) => {
      const next = serialiseDocument(updatedEditor.getJSON());
      lastExternalContent.current = next;
      onChangeRef.current(next);
    },
  });

  useEffect(() => {
    if (!editor || content === lastExternalContent.current) return;
    editor.commands.setContent(parseDocument(content), { emitUpdate: false });
    lastExternalContent.current = serialiseDocument(editor.getJSON());
  }, [content, editor]);

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) {
        return {
          activeBlock: 'paragraph',
          bold: false,
          bulletList: false,
          canRedo: false,
          canUndo: false,
          code: false,
          codeBlock: false,
          highlight: false,
          italic: false,
          orderedList: false,
          quote: false,
          strike: false,
          taskList: false,
          underline: false,
          words: '0 words',
        };
      }
      return {
        activeBlock: currentEditor.isActive('heading', { level: 1 })
          ? 'heading-1'
          : currentEditor.isActive('heading', { level: 2 })
            ? 'heading-2'
            : currentEditor.isActive('heading', { level: 3 })
              ? 'heading-3'
              : currentEditor.isActive('heading', { level: 4 })
                ? 'heading-4'
                : currentEditor.isActive('codeBlock')
                  ? 'code'
                  : 'paragraph',
        bold: currentEditor.isActive('bold'),
        bulletList: currentEditor.isActive('bulletList'),
        canRedo: currentEditor.can().redo(),
        canUndo: currentEditor.can().undo(),
        code: currentEditor.isActive('code'),
        codeBlock: currentEditor.isActive('codeBlock'),
        highlight: currentEditor.isActive('highlight'),
        italic: currentEditor.isActive('italic'),
        orderedList: currentEditor.isActive('orderedList'),
        quote: currentEditor.isActive('blockquote'),
        strike: currentEditor.isActive('strike'),
        taskList: currentEditor.isActive('taskList'),
        underline: currentEditor.isActive('underline'),
        words: formatWordCount(currentEditor.getText()),
      };
    },
  });

  const applyBlock = (value: string) => {
    const chain = editor?.chain().focus();
    if (!chain) return;
    if (value === 'paragraph') chain.setParagraph().run();
    else if (value === 'code') chain.toggleCodeBlock().run();
    else {
      const level = Number(value.replace('heading-', ''));
      chain.toggleHeading({ level: level as 1 | 2 | 3 | 4 }).run();
    }
  };

  const openLinkEditor = () => {
    if (!editor) return;
    setLinkValue(String(editor.getAttributes('link').href ?? ''));
    setLinkOpen(true);
  };

  const saveLink = () => {
    if (!editor) return;
    const value = linkValue.trim();
    if (!value) {
      editor.chain().focus().unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const href = value.includes(':') ? value : `https://${value}`;
    if (!isSafeLink(href)) {
      setUploadError('Use a valid http, https, or mailto link.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false);
  };

  const addMedia = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    queueFiles(files);
  };

  if (!editor || !toolbarState) return <p className="muted">Loading editor…</p>;

  return (
    <div
      className={`tiptap-editor ${dropActive ? 'is-drop-active' : ''}`}
      onDragEnter={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files'))
          setDropActive(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropActive(false);
        }
      }}
      onDrop={(event) => {
        setDropActive(false);
        // FileHandler owns normal ProseMirror drops and preserves the exact
        // pointer position. This is a small fallback for browsers/webviews
        // that dispatch a file drop without reaching that plugin.
        if (event.defaultPrevented) return;
        const files = Array.from(event.dataTransfer.files);
        if (files.some(isAcceptedMediaFile)) {
          event.preventDefault();
          queueFiles(files);
        }
      }}
      onPaste={(event) => {
        // Mirrors the fallback above. FileHandler stops propagation when it
        // handles a native paste, so a successful normal paste is not doubled.
        if (event.defaultPrevented) return;
        const files = Array.from(event.clipboardData.files);
        if (files.some(isAcceptedMediaFile)) {
          event.preventDefault();
          queueFiles(files);
        }
      }}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files'))
          event.preventDefault();
      }}
    >
      <div
        className="tiptap-toolbar"
        role="toolbar"
        aria-label="Document formatting"
      >
        <div className="toolbar-group" aria-label="History">
          <button
            type="button"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={!toolbarState.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            disabled={!toolbarState.canRedo}
            onClick={() => editor.chain().focus().redo().run()}
          >
            ↷
          </button>
        </div>
        <div className="toolbar-group">
          <label className="visually-hidden" htmlFor="block-style">
            Text style
          </label>
          <select
            id="block-style"
            aria-label="Text style"
            value={toolbarState.activeBlock}
            onChange={(event) => applyBlock(event.target.value)}
          >
            <option value="paragraph">Paragraph</option>
            <option value="heading-1">Heading 1</option>
            <option value="heading-2">Heading 2</option>
            <option value="heading-3">Heading 3</option>
            <option value="heading-4">Heading 4</option>
            <option value="code">Code block</option>
          </select>
        </div>
        <div className="toolbar-group" aria-label="Inline formatting">
          <button
            type="button"
            aria-label="Bold"
            title="Bold (Ctrl+B)"
            className={toolbarState.bold ? 'active' : ''}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            aria-label="Italic"
            title="Italic (Ctrl+I)"
            className={toolbarState.italic ? 'active' : ''}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            aria-label="Underline"
            title="Underline (Ctrl+U)"
            className={toolbarState.underline ? 'active' : ''}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <u>U</u>
          </button>
          <button
            type="button"
            aria-label="Strikethrough"
            title="Strikethrough"
            className={toolbarState.strike ? 'active' : ''}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <s>S</s>
          </button>
          <button
            type="button"
            aria-label="Inline code"
            title="Inline code"
            className={toolbarState.code ? 'active' : ''}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            &lt;/&gt;
          </button>
          <button
            type="button"
            aria-label="Highlight"
            title="Highlight"
            className={toolbarState.highlight ? 'active' : ''}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            ✦
          </button>
        </div>
        <div className="toolbar-group" aria-label="Blocks">
          <button
            type="button"
            className={toolbarState.bulletList ? 'active' : ''}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            Bullets
          </button>
          <button
            type="button"
            className={toolbarState.orderedList ? 'active' : ''}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            Numbered
          </button>
          <button
            type="button"
            className={toolbarState.taskList ? 'active' : ''}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            Tasks
          </button>
          <button
            type="button"
            className={toolbarState.quote ? 'active' : ''}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            Quote
          </button>
          <button
            type="button"
            className={toolbarState.codeBlock ? 'active' : ''}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            Code
          </button>
          <button
            type="button"
            aria-label="Divider"
            title="Divider"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            —
          </button>
        </div>
        <div className="toolbar-group" aria-label="Insert">
          <button type="button" onClick={openLinkEditor}>
            Link
          </button>
          <button
            type="button"
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          >
            Table
          </button>
          <button
            type="button"
            aria-label="Add image or video"
            title="Add image or video"
            onClick={() => inputRef.current?.click()}
          >
            Media
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            hidden
            multiple
            accept={MEDIA_FILE_ACCEPT}
            aria-hidden="true"
            tabIndex={-1}
            onChange={addMedia}
          />
        </div>
        <div
          className="toolbar-group toolbar-alignment"
          aria-label="Text alignment"
        >
          <button
            type="button"
            aria-label="Align text left"
            title="Align left"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          >
            ≡
          </button>
          <button
            type="button"
            aria-label="Align text center"
            title="Align center"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          >
            ≡
          </button>
          <button
            type="button"
            aria-label="Align text right"
            title="Align right"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          >
            ≡
          </button>
        </div>
      </div>
      {linkOpen && (
        <form
          className="link-editor"
          onSubmit={(event) => {
            event.preventDefault();
            saveLink();
          }}
        >
          <label>
            Link URL
            <input
              autoFocus
              value={linkValue}
              placeholder="https://example.com"
              onChange={(event) => setLinkValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setLinkOpen(false);
              }}
            />
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => setLinkOpen(false)}
          >
            Cancel
          </button>
          <button>Apply link</button>
          {editor.isActive('link') && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                editor.chain().focus().unsetLink().run();
                setLinkOpen(false);
              }}
            >
              Remove link
            </button>
          )}
        </form>
      )}
      <EditorContent
        editor={editor}
        className="tiptap-content tiptap-editable"
      />
      <div className="editor-status" aria-live="polite">
        <span>{toolbarState.words}</span>
        <span>Tab indents text; lists nest; tables move between cells.</span>
        {activeUploads > 0 && (
          <span>
            Uploading {activeUploads} {activeUploads === 1 ? 'file' : 'files'}…
          </span>
        )}
      </div>
      {dropActive && (
        <div className="media-drop-overlay">
          Drop images or videos to import them here
        </div>
      )}
      {uploadError && (
        <p role="alert" className="editor-alert">
          {uploadError}
        </p>
      )}
    </div>
  );
}
