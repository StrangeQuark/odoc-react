import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps,
} from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import StarterKit from '@tiptap/starter-kit';
import {
  fetchAuthenticatedImage,
  type Credentials,
  type MediaAsset,
} from '../shared/api';

type RichDocumentProps = {
  content: string;
  credentials: Credentials;
};

type RichTextEditorProps = RichDocumentProps & {
  onChange: (content: string) => void;
  onUpload: (file: File) => Promise<MediaAsset>;
};

function textNode(text: string): JSONContent[] | undefined {
  return text ? [{ type: 'text', text }] : undefined;
}

function paragraph(text = ''): JSONContent {
  return { type: 'paragraph', content: textNode(text) };
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
      const level = heading[1]?.length ?? 1;
      const headingText = heading[2] ?? '';
      content.push({
        type: 'heading',
        attrs: { level },
        content: textNode(headingText),
      });
      continue;
    }

    if (image) {
      content.push({
        type: 'image',
        attrs: { src: image[2], alt: image[1], title: null },
      });
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
        items.push({ type: 'listItem', content: [paragraph(item[1])] });
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

function parseDocument(content: string): JSONContent {
  try {
    const parsed = JSON.parse(content) as JSONContent;
    if (parsed.type === 'doc' && Array.isArray(parsed.content)) return parsed;
  } catch {
    // Legacy Markdown is intentionally converted client-side during the MVP migration.
  }
  return legacyMarkdownToDocument(content);
}

function AuthenticatedImageView({
  node,
  credentials,
}: NodeViewProps & { credentials: Credentials }) {
  const [authenticatedSource, setAuthenticatedSource] = useState<string | null>(
    null,
  );
  const path = String(node.attrs.src ?? '');
  const isAuthenticatedMedia = path.startsWith('/api/v1/media/');
  const source = isAuthenticatedMedia ? authenticatedSource : path || null;

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    if (!isAuthenticatedMedia) return undefined;
    void fetchAuthenticatedImage(credentials, path)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setAuthenticatedSource(objectUrl);
      })
      .catch(() => {
        if (active) setAuthenticatedSource(null);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [credentials, isAuthenticatedMedia, path]);

  return (
    <NodeViewWrapper as="figure" className="tiptap-image">
      {source ? (
        <img src={source} alt={String(node.attrs.alt ?? '')} />
      ) : (
        <span className="image-loading">Loading image…</span>
      )}
    </NodeViewWrapper>
  );
}

function createExtensions(credentials: Credentials, editable: boolean) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
    }),
    Link.configure({
      autolink: true,
      defaultProtocol: 'https',
      openOnClick: !editable,
    }),
    Image.extend({
      addNodeView() {
        return ReactNodeViewRenderer((props) => (
          <AuthenticatedImageView {...props} credentials={credentials} />
        ));
      },
    }).configure({ allowBase64: false }),
    Table.configure({ resizable: editable }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder: 'Start writing…' }),
  ];
}

export function RichDocument({ content, credentials }: RichDocumentProps) {
  const document = useMemo(() => parseDocument(content), [content]);
  const extensions = useMemo(
    () => createExtensions(credentials, false),
    [credentials],
  );
  const editor = useEditor({
    content: document,
    editable: false,
    extensions,
    immediatelyRender: false,
  });

  useEffect(() => {
    editor?.commands.setContent(document);
  }, [document, editor]);

  return <EditorContent editor={editor} className="tiptap-content" />;
}

export function RichTextEditor({
  content,
  credentials,
  onChange,
  onUpload,
}: RichTextEditorProps) {
  const [initialDocument] = useState(() => parseDocument(content));
  const extensions = useMemo(
    () => createExtensions(credentials, true),
    [credentials],
  );
  const [uploadError, setUploadError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    content: initialDocument,
    editorProps: {
      attributes: {
        'aria-label': 'Document content',
      },
    },
    extensions,
    immediatelyRender: false,
    onCreate: ({ editor: createdEditor }) =>
      onChange(JSON.stringify(createdEditor.getJSON())),
    onUpdate: ({ editor: updatedEditor }) =>
      onChange(JSON.stringify(updatedEditor.getJSON())),
  });

  const addLink = () => {
    const href = window.prompt('Paste a URL');
    if (href)
      editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  const addImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!file || !editor) return;
    try {
      setUploading(true);
      setUploadError(undefined);
      const asset = await onUpload(file);
      editor
        .chain()
        .focus()
        .setImage({ src: asset.url, alt: asset.filename })
        .run();
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : 'Could not upload image.',
      );
    } finally {
      setUploading(false);
    }
  };

  if (!editor) return <p className="muted">Loading editor…</p>;

  return (
    <div className="tiptap-editor">
      <div className="tiptap-toolbar" aria-label="Formatting controls">
        <button
          type="button"
          aria-label="Undo"
          title="Undo"
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo"
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </button>
        <span className="toolbar-divider" />
        <button
          type="button"
          className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          Heading
        </button>
        <button
          type="button"
          className={editor.isActive('bold') ? 'active' : ''}
          aria-label="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={editor.isActive('italic') ? 'active' : ''}
          aria-label="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={editor.isActive('bulletList') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Bullet list
        </button>
        <button
          type="button"
          className={editor.isActive('orderedList') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          Numbered list
        </button>
        <button
          type="button"
          className={editor.isActive('blockquote') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </button>
        <button
          type="button"
          className={editor.isActive('codeBlock') ? 'active' : ''}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          Code
        </button>
        <button type="button" onClick={addLink}>
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
        <button type="button" onClick={() => imageInput.current?.click()}>
          Image
        </button>
        <input
          ref={imageInput}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={(event) => void addImage(event)}
        />
      </div>
      <EditorContent
        editor={editor}
        className="tiptap-content tiptap-editable"
      />
      {uploading && <p className="muted">Uploading image…</p>}
      {uploadError && <p role="alert">{uploadError}</p>}
    </div>
  );
}
