import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { Link, Route, Routes } from 'react-router-dom';
import {
  odocApi,
  fetchAuthenticatedImage,
  type Credentials,
  type Page,
  type PageVersion,
  type RepositoryBinding,
  type Space,
} from '../shared/api';
import { type RichTextEditorController } from './RichDocument';

// Editing is a substantial dependency (ProseMirror/Tiptap and rich-media node
// views), so it should not delay the initial workspace shell.
const RichDocument = lazy(async () => {
  const module = await import('./RichDocument');
  return { default: module.RichDocument };
});
const RichTextEditor = lazy(async () => {
  const module = await import('./RichDocument');
  return { default: module.RichTextEditor };
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

/**
 * A synchronous, page-owned check used by workspace navigation before it can
 * unmount an editor. Keeping this at the workspace boundary means every
 * navigation surface (space nav, search, destructive actions, and logout)
 * follows the same safety rule.
 */
type EditorExitGuard = () => boolean;

function LoginPage({
  onLogin,
}: {
  onLogin: (credentials: Credentials) => void;
}) {
  const [username, setUsername] = useState('developer');
  const [password, setPassword] = useState('developer');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onLogin({ username, password });
  }

  return (
    <main id="main-content" className="login-shell">
      <section className="login-card" aria-labelledby="welcome-heading">
        <p className="eyebrow">Documentation workspace</p>
        <h1 id="welcome-heading">Build a home for what your team knows.</h1>
        <p className="lede">
          This local MVP uses a temporary development account. Production
          authentication will be replaced by OIDC.
        </p>
        <form onSubmit={submit} className="stack-form">
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit">Enter Odoc</button>
        </form>
      </section>
    </main>
  );
}

function MarkdownPreview({
  content,
  credentials,
}: {
  content: string;
  credentials?: Credentials;
}) {
  return (
    <article className="markdown-preview" aria-label="Page content">
      {content
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((block, index) => {
          const line = block.trim();
          const lines = line.split('\n');
          if (line.startsWith('### '))
            return <h3 key={index}>{line.slice(4)}</h3>;
          if (line.startsWith('## '))
            return <h2 key={index}>{line.slice(3)}</h2>;
          if (line.startsWith('# '))
            return <h1 key={index}>{line.slice(2)}</h1>;
          if (line.startsWith('```') && line.endsWith('```')) {
            return (
              <pre key={index}>
                <code>
                  {line.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '')}
                </code>
              </pre>
            );
          }
          const image = line.match(
            /^!\[([^\]]*)\]\((\/api\/v1\/media\/[a-f0-9-]+)\)$/i,
          );
          if (
            image &&
            credentials &&
            image[1] !== undefined &&
            image[2] !== undefined
          ) {
            return (
              <AuthenticatedImage
                key={index}
                credentials={credentials}
                path={image[2]}
                alt={image[1]}
              />
            );
          }
          if (lines.every((item) => /^[-*] /.test(item))) {
            return (
              <ul key={index}>
                {lines.map((item) => (
                  <li key={item}>{item.replace(/^[-*] /, '')}</li>
                ))}
              </ul>
            );
          }
          if (lines.every((item) => /^\d+\. /.test(item))) {
            return (
              <ol key={index}>
                {lines.map((item) => (
                  <li key={item}>{item.replace(/^\d+\. /, '')}</li>
                ))}
              </ol>
            );
          }
          if (lines.every((item) => item.startsWith('> '))) {
            return (
              <blockquote key={index}>
                {lines.map((item) => item.slice(2)).join('\n')}
              </blockquote>
            );
          }
          return <p key={index}>{line}</p>;
        })}
    </article>
  );
}

function AuthenticatedImage({
  credentials,
  path,
  alt,
}: {
  credentials: Credentials;
  path: string;
  alt: string;
}) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const abortController = new AbortController();
    void fetchAuthenticatedImage(credentials, path, abortController.signal)
      .then((blob) => {
        const nextObjectUrl = URL.createObjectURL(blob);
        if (active) {
          objectUrl = nextObjectUrl;
          setSource(nextObjectUrl);
        } else {
          URL.revokeObjectURL(nextObjectUrl);
        }
      })
      .catch((error: unknown) => {
        if (
          active &&
          !(error instanceof DOMException && error.name === 'AbortError')
        ) {
          setSource(null);
        }
      });
    return () => {
      active = false;
      abortController.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [credentials, path]);
  if (!source) return <p className="muted">Loading image…</p>;
  return <img className="document-image" src={source} alt={alt} />;
}

function Workspace({
  credentials,
  onLogout,
}: {
  credentials: Credentials;
  onLogout: () => void;
}) {
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newRepositoryOpen, setNewRepositoryOpen] = useState(false);
  const editorExitGuard = useRef<EditorExitGuard | null>(null);
  const setEditorExitGuard = useCallback((guard: EditorExitGuard | null) => {
    editorExitGuard.current = guard;
  }, []);
  const canLeavePageEditor = useCallback(
    () => editorExitGuard.current?.() ?? true,
    [],
  );
  const spaces = useQuery({
    queryKey: ['spaces'],
    queryFn: () => odocApi.listSpaces(credentials),
  });
  const pages = useQuery({
    queryKey: ['pages', selectedSpace?.id],
    queryFn: () => odocApi.listPages(credentials, selectedSpace!.id),
    enabled: selectedSpace !== null,
  });
  const results = useQuery({
    queryKey: ['search', search],
    queryFn: () => odocApi.search(credentials, search),
    enabled: search.trim().length >= 2,
  });
  const repositories = useQuery({
    queryKey: ['repositories', selectedSpace?.id],
    queryFn: () => odocApi.listRepositories(credentials, selectedSpace!.id),
    enabled: selectedSpace !== null,
  });
  const createSpace = useMutation({
    mutationFn: (input: Pick<Space, 'key' | 'name' | 'description'>) =>
      odocApi.createSpace(credentials, input),
    onSuccess: (space) => {
      void queryClient.invalidateQueries({ queryKey: ['spaces'] });
      // A create-space dialog can remain open while someone edits a page. Do
      // not let its successful mutation switch workspaces underneath them.
      if (!canLeavePageEditor()) {
        setNewSpaceOpen(false);
        return;
      }
      setSelectedSpace(space);
      setSelectedPage(null);
      setEditingPageId(null);
      setNewSpaceOpen(false);
    },
  });
  const createPage = useMutation({
    mutationFn: (
      input: Pick<Page, 'title' | 'content'> & { parentId?: string },
    ) => odocApi.createPage(credentials, selectedSpace!.id, input),
    onSuccess: (page) => {
      void queryClient.invalidateQueries({
        queryKey: ['pages', selectedSpace?.id],
      });
      setSelectedPage(page);
      setEditingPageId(page.id);
      setNewPageOpen(false);
    },
  });
  const updatePage = useMutation({
    mutationFn: (input: Pick<Page, 'title' | 'content'>) =>
      odocApi.updatePage(credentials, selectedPage!.id, input),
    onSuccess: (page) => {
      setSelectedPage(page);
      void queryClient.invalidateQueries({ queryKey: ['pages', page.spaceId] });
      void queryClient.invalidateQueries({ queryKey: ['search'] });
    },
  });
  const deletePage = useMutation({
    mutationFn: (page: Page) => odocApi.deletePage(credentials, page.id),
    onSuccess: (_, page) => {
      setSelectedPage(null);
      void queryClient.invalidateQueries({ queryKey: ['pages', page.spaceId] });
      void queryClient.invalidateQueries({ queryKey: ['search'] });
    },
  });
  const attachRepository = useMutation({
    mutationFn: (url: string) =>
      odocApi.attachRepository(credentials, selectedSpace!.id, url),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['repositories', selectedSpace?.id],
      });
      setNewRepositoryOpen(false);
    },
  });

  const showSpace = (space: Space) => {
    if (
      (space.id !== selectedSpace?.id || selectedPage !== null) &&
      !canLeavePageEditor()
    )
      return;
    setSelectedSpace(space);
    setSelectedPage(null);
    setEditingPageId(null);
  };

  const showPage = (page: Page) => {
    if (page.id === selectedPage?.id) return;
    if (!canLeavePageEditor()) return;

    // Search can select a page from a different space. Keep the surrounding
    // workspace in sync when that space is already known, while using the
    // page's own space ID for media uploads below either way.
    const pageSpace = spaces.data?.find((space) => space.id === page.spaceId);
    if (pageSpace) setSelectedSpace(pageSpace);
    setSelectedPage(page);
    setEditingPageId(null);
  };

  return (
    <main id="main-content" className="workspace-shell">
      <aside className="sidebar" aria-label="Spaces">
        <div className="sidebar-heading">
          <span>Spaces</span>
          <button
            onClick={() => setNewSpaceOpen(true)}
            aria-label="Create space"
          >
            +
          </button>
        </div>
        {spaces.isPending && <p className="muted">Loading spaces…</p>}
        {spaces.isError && <p role="alert">Could not load spaces.</p>}
        {spaces.data?.map((space) => (
          <button
            key={space.id}
            className={
              selectedSpace?.id === space.id ? 'nav-item selected' : 'nav-item'
            }
            onClick={() => showSpace(space)}
          >
            <span>{space.key}</span>
            {space.name}
          </button>
        ))}
        {spaces.data?.length === 0 && (
          <p className="muted">Create your first space to begin.</p>
        )}
      </aside>
      <section className="workspace-content">
        <div className="toolbar">
          <label className="search-box">
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search pages"
            />
          </label>
          <button
            className="secondary"
            onClick={() => {
              if (canLeavePageEditor()) onLogout();
            }}
          >
            Log out
          </button>
        </div>
        {search.trim().length >= 2 && (
          <section className="search-results" aria-live="polite">
            <strong>Search results</strong>
            {results.isPending && <p>Searching…</p>}
            {results.data?.map((page) => (
              <button key={page.id} onClick={() => showPage(page)}>
                {page.title}
              </button>
            ))}
            {results.data?.length === 0 && <p>No matching pages.</p>}
          </section>
        )}
        {!selectedSpace && (
          <EmptyWorkspace onCreate={() => setNewSpaceOpen(true)} />
        )}
        {selectedSpace && !selectedPage && (
          <section className="space-home">
            <p className="eyebrow">{selectedSpace.key}</p>
            <h1>{selectedSpace.name}</h1>
            <p className="lede">
              {selectedSpace.description || 'No description yet.'}
            </p>
            <div className="section-header">
              <h2>Pages</h2>
              <button onClick={() => setNewPageOpen(true)}>New page</button>
            </div>
            {pages.isPending && <p>Loading pages…</p>}
            {pages.data && <PageTree pages={pages.data} onSelect={showPage} />}
            {pages.data?.length === 0 && (
              <p className="muted">No pages in this space yet.</p>
            )}
            <div className="section-header">
              <h2>Linked repositories</h2>
              <button onClick={() => setNewRepositoryOpen(true)}>
                Attach GitHub repository
              </button>
            </div>
            {repositories.isPending && <p>Loading repositories…</p>}
            {repositories.isError && (
              <p role="alert">Could not load attached repositories.</p>
            )}
            {repositories.data?.map((repository) => (
              <RepositoryCard key={repository.id} repository={repository} />
            ))}
            {repositories.data?.length === 0 && (
              <p className="muted">No GitHub repositories attached yet.</p>
            )}
          </section>
        )}
        {selectedPage && (
          <PageEditor
            key={selectedPage.id}
            initialEditing={editingPageId === selectedPage.id}
            page={selectedPage}
            spaceId={selectedPage.spaceId}
            credentials={credentials}
            saving={updatePage.isPending}
            saveError={
              updatePage.isError
                ? updatePage.error instanceof Error
                  ? updatePage.error.message
                  : 'Could not publish this page. Your edits are still here.'
                : undefined
            }
            onSave={(input) => updatePage.mutateAsync(input)}
            onEditingEnd={() => setEditingPageId(null)}
            onExitGuardChange={setEditorExitGuard}
            onRestore={(page) => {
              setSelectedPage(page);
              void queryClient.invalidateQueries({
                queryKey: ['pages', page.spaceId],
              });
              void queryClient.invalidateQueries({ queryKey: ['search'] });
            }}
            onCreateChild={() => {
              if (!canLeavePageEditor()) return;
              createPage.mutate({
                title: 'Untitled child page',
                content: '',
                parentId: selectedPage.id,
              });
            }}
            deleting={deletePage.isPending}
            onDelete={() => {
              if (
                !window.confirm(
                  `Delete “${selectedPage.title}”? This cannot be undone.`,
                )
              )
                return;
              if (!canLeavePageEditor()) return;
              deletePage.mutate(selectedPage);
            }}
          />
        )}
      </section>
      {newSpaceOpen && (
        <SpaceDialog
          busy={createSpace.isPending}
          error={createSpace.error?.message}
          onClose={() => setNewSpaceOpen(false)}
          onSubmit={(input) => createSpace.mutate(input)}
        />
      )}
      {newPageOpen && (
        <PageDialog
          busy={createPage.isPending}
          error={createPage.error?.message}
          onClose={() => setNewPageOpen(false)}
          onSubmit={(title) => createPage.mutate({ title, content: '' })}
        />
      )}
      {newRepositoryOpen && (
        <RepositoryDialog
          busy={attachRepository.isPending}
          error={attachRepository.error?.message}
          onClose={() => setNewRepositoryOpen(false)}
          onSubmit={(url) => attachRepository.mutate(url)}
        />
      )}
    </main>
  );
}

function EmptyWorkspace({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="empty-state">
      <p className="eyebrow">Get started</p>
      <h1>Put your team’s knowledge somewhere it can grow.</h1>
      <p>Create a space, add a page, and search it immediately.</p>
      <button onClick={onCreate}>Create a space</button>
    </section>
  );
}

function PageTree({
  pages,
  onSelect,
}: {
  pages: Page[];
  onSelect: (page: Page) => void;
}) {
  const pagesByParent = new Map<string | null, Page[]>();
  for (const page of pages) {
    const key =
      page.parentId && pages.some((candidate) => candidate.id === page.parentId)
        ? page.parentId
        : null;
    pagesByParent.set(key, [...(pagesByParent.get(key) ?? []), page]);
  }
  const render = (parentId: string | null, depth: number): ReactNode =>
    pagesByParent.get(parentId)?.map((page) => (
      <div key={page.id}>
        <button
          className="page-row"
          onClick={() => onSelect(page)}
          style={{ paddingLeft: `${1 + depth * 1.25}rem` }}
        >
          <strong>{page.title}</strong>
          <span>Updated {new Date(page.updatedAt).toLocaleString()}</span>
        </button>
        {render(page.id, depth + 1)}
      </div>
    ));
  return <div className="page-tree">{render(null, 0)}</div>;
}

function SpaceDialog({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (input: Pick<Space, 'key' | 'name' | 'description'>) => void;
}) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  return (
    <dialog open className="dialog">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ key, name, description });
        }}
        className="stack-form"
      >
        <h2>Create a space</h2>
        <label>
          Key
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="ENG"
            required
          />
        </label>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Engineering"
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy}>{busy ? 'Creating…' : 'Create space'}</button>
        </div>
      </form>
    </dialog>
  );
}

function PageDialog({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (title: string) => void;
}) {
  const [title, setTitle] = useState('');
  return (
    <dialog open className="dialog">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(title);
        }}
        className="stack-form"
      >
        <h2>Create a page</h2>
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <p className="muted">
          You’ll write the page directly in the document after it is created.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy}>{busy ? 'Creating…' : 'Create page'}</button>
        </div>
      </form>
    </dialog>
  );
}

function RepositoryDialog({
  busy,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState('');
  return (
    <dialog open className="dialog">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(url);
        }}
        className="stack-form"
      >
        <h2>Attach a GitHub repository</h2>
        <p className="muted">
          Public repositories can be read without connecting an account in this
          MVP.
        </p>
        <label>
          Canonical GitHub URL
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://github.com/owner/repository"
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy}>
            {busy ? 'Attaching…' : 'Attach repository'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function RepositoryCard({ repository }: { repository: RepositoryBinding }) {
  return (
    <article className="repository-card">
      <div className="repository-heading">
        <div>
          <p className="eyebrow">GitHub repository</p>
          <h3>
            {repository.owner}/{repository.name}
          </h3>
        </div>
        <a href={repository.githubUrl} target="_blank" rel="noreferrer">
          Open on GitHub
        </a>
      </div>
      {repository.description && <p>{repository.description}</p>}
      <p className="muted">
        Branch: {repository.defaultBranch || 'unknown'} · ★{' '}
        {repository.stars.toLocaleString()} · synced{' '}
        {new Date(repository.syncedAt).toLocaleString()}
      </p>
      {repository.readmeContent ? (
        <details>
          <summary>README ({repository.readmePath})</summary>
          <MarkdownPreview content={repository.readmeContent} />
        </details>
      ) : (
        <p className="muted">
          This repository does not have a readable README.
        </p>
      )}
    </article>
  );
}

function PageEditor({
  initialEditing,
  page,
  spaceId,
  credentials,
  saving,
  saveError,
  onSave,
  onEditingEnd,
  onExitGuardChange,
  onRestore,
  onCreateChild,
  onDelete,
  deleting,
}: {
  initialEditing: boolean;
  page: Page;
  spaceId: string;
  credentials: Credentials;
  saving: boolean;
  saveError?: string;
  onSave: (input: Pick<Page, 'title' | 'content'>) => Promise<Page>;
  onEditingEnd: () => void;
  onExitGuardChange: (guard: EditorExitGuard | null) => void;
  onRestore: (page: Page) => void;
  onCreateChild: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [editing, setEditing] = useState(initialEditing);
  const [uploadsPending, setUploadsPending] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [exitMessage, setExitMessage] = useState<string>();
  const editorController = useRef<RichTextEditorController | null>(null);
  const dirty = title !== page.title || content !== page.content;
  const favorite = useQuery({
    queryKey: ['favorite', page.id],
    queryFn: () => odocApi.favoriteStatus(credentials, page.id),
  });
  const setFavorite = useMutation({
    mutationFn: (value: boolean) =>
      odocApi.setFavorite(credentials, page.id, value),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['favorite', page.id] }),
  });
  const history = useQuery({
    queryKey: ['page-history', page.id],
    queryFn: () => odocApi.listPageHistory(credentials, page.id),
    enabled: showHistory,
  });
  const restore = useMutation({
    mutationFn: (versionId: string) =>
      odocApi.restorePageVersion(credentials, page.id, versionId),
    onSuccess: (restoredPage) => {
      setTitle(restoredPage.title);
      setContent(restoredPage.content);
      onRestore(restoredPage);
      void queryClient.invalidateQueries({
        queryKey: ['page-history', page.id],
      });
    },
  });
  const requestEditorExit = useCallback(() => {
    if (!editing) return true;
    if (saving) {
      setExitMessage(
        'This page is still saving. Wait for it to finish before leaving.',
      );
      return false;
    }
    if (
      uploadsPending > 0 ||
      editorController.current?.hasActiveUploads() === true
    ) {
      setExitMessage(
        'Media is still uploading. Wait for all uploads to finish before leaving this page.',
      );
      return false;
    }
    if (dirty && !window.confirm('Discard your unpublished changes?')) {
      return false;
    }

    setExitMessage(undefined);
    editorController.current?.discardUnpublishedAssets();
    return true;
  }, [dirty, editing, saving, uploadsPending]);

  useEffect(() => {
    if (!editing) {
      onExitGuardChange(null);
      return undefined;
    }
    onExitGuardChange(requestEditorExit);
    return () => onExitGuardChange(null);
  }, [editing, onExitGuardChange, requestEditorExit]);

  const cancelEditing = () => {
    if (!requestEditorExit()) return;
    setTitle(page.title);
    setContent(page.content);
    setEditing(false);
    onEditingEnd();
  };

  const savePage = async () => {
    if (saving) return;
    if (uploadsPending > 0 || editorController.current?.hasActiveUploads()) {
      setExitMessage(
        'Media is still uploading. Wait for all uploads to finish before publishing.',
      );
      return;
    }
    const latestContent = editorController.current?.getContent() ?? content;
    try {
      await onSave({ title, content: latestContent });
      editorController.current?.markPublished();
      setContent(latestContent);
      setEditing(false);
      onEditingEnd();
    } catch {
      // Keep the rich document mounted so the user can retry without data loss.
    }
  };

  useEffect(() => {
    if (!editing || (!dirty && uploadsPending === 0)) return undefined;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty, editing, uploadsPending]);

  useEffect(() => {
    if (!editing) return undefined;
    const saveWithShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void savePage();
      }
    };
    window.addEventListener('keydown', saveWithShortcut);
    return () => window.removeEventListener('keydown', saveWithShortcut);
  });

  return (
    <section className="document-shell">
      <article className="document-page">
        <div className="page-actions" aria-label="Page actions">
          <span className="page-status">
            {editing ? (dirty ? 'Unsaved changes' : 'Editing') : 'Published'}
          </span>
          <div className="page-actions-controls">
            {!editing && (
              <button
                className="secondary"
                onClick={() => {
                  setExitMessage(undefined);
                  setEditing(true);
                }}
              >
                Edit
              </button>
            )}
            <button
              className="icon-button"
              aria-label={favorite.data?.favorite ? 'Unstar page' : 'Star page'}
              aria-pressed={favorite.data?.favorite ?? false}
              disabled={favorite.isPending || setFavorite.isPending}
              onClick={() =>
                setFavorite.mutate(!(favorite.data?.favorite ?? false))
              }
            >
              {favorite.data?.favorite ? '★' : '☆'}
            </button>
            <button
              className="secondary"
              onClick={() => setShowHistory((visible) => !visible)}
              aria-expanded={showHistory}
            >
              {showHistory ? 'Hide history' : 'View history'}
            </button>
            <details className="page-more-actions">
              <summary aria-label="More page actions">•••</summary>
              <div>
                <button className="menu-button" onClick={onCreateChild}>
                  New child page
                </button>
                <button
                  className="menu-button danger-text"
                  onClick={onDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete page'}
                </button>
              </div>
            </details>
          </div>
        </div>

        {editing ? (
          <div className="document-editor">
            <input
              aria-label="Title"
              className="document-title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Suspense fallback={<p className="muted">Loading editor…</p>}>
              <RichTextEditor
                content={content}
                credentials={credentials}
                onChange={setContent}
                onControllerChange={(controller) => {
                  editorController.current = controller;
                }}
                onUploadCountChange={(count) => {
                  setUploadsPending(count);
                  if (count === 0) {
                    setExitMessage((message) =>
                      message?.startsWith('Media is still uploading')
                        ? undefined
                        : message,
                    );
                  }
                }}
                onDeleteMedia={(assetId) =>
                  odocApi.deleteMedia(credentials, assetId)
                }
                onUpload={(file) =>
                  odocApi.uploadMedia(credentials, spaceId, file)
                }
              />
            </Suspense>
            <div className="editor-footer">
              {saveError && (
                <p className="editor-alert" role="alert">
                  Could not publish this page: {saveError}
                </p>
              )}
              {exitMessage && (
                <p className="editor-alert" role="alert">
                  {exitMessage}
                </p>
              )}
              <div className="editor-footer-actions">
                <button
                  className="secondary"
                  onClick={cancelEditing}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void savePage()}
                  disabled={saving || uploadsPending > 0}
                >
                  {saving
                    ? 'Saving…'
                    : uploadsPending > 0
                      ? 'Uploading media…'
                      : dirty
                        ? 'Publish changes'
                        : 'Published'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="page-breadcrumb">Documentation page</p>
            <h1 className="document-title">{page.title}</h1>
            <p className="page-meta">
              Last updated {new Date(page.updatedAt).toLocaleString()}
            </p>
            <Suspense fallback={<p className="muted">Loading document…</p>}>
              <RichDocument content={page.content} credentials={credentials} />
            </Suspense>
          </>
        )}

        {showHistory && (
          <PageHistory
            versions={history.data}
            loading={history.isPending}
            error={history.isError}
            onRestore={(versionId) => restore.mutate(versionId)}
          />
        )}
        {!editing && <Comments credentials={credentials} pageId={page.id} />}
      </article>
    </section>
  );
}

function Comments({
  credentials,
  pageId,
}: {
  credentials: Credentials;
  pageId: string;
}) {
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const comments = useQuery({
    queryKey: ['comments', pageId],
    queryFn: () => odocApi.listComments(credentials, pageId),
  });
  const create = useMutation({
    mutationFn: () =>
      odocApi.createComment(credentials, pageId, { body, parentId: replyTo }),
    onSuccess: () => {
      setBody('');
      setReplyTo(undefined);
      void queryClient.invalidateQueries({ queryKey: ['comments', pageId] });
    },
  });
  return (
    <section className="comments" aria-label="Page discussion">
      <h2>Discussion</h2>
      {comments.isPending && <p className="muted">Loading comments…</p>}
      {comments.data?.map((comment) => (
        <article key={comment.id} className={comment.parentId ? 'reply' : ''}>
          <strong>{comment.author}</strong>
          <span>{new Date(comment.createdAt).toLocaleString()}</span>
          <p>{comment.body}</p>
          <button
            className="text-button"
            onClick={() => setReplyTo(comment.id)}
          >
            Reply
          </button>
        </article>
      ))}
      <label>
        {replyTo ? 'Reply' : 'Add a comment'}
        <textarea
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      {replyTo && (
        <button className="text-button" onClick={() => setReplyTo(undefined)}>
          Cancel reply
        </button>
      )}
      {create.isError && <p role="alert">Could not add comment.</p>}
      <button
        disabled={!body.trim() || create.isPending}
        onClick={() => create.mutate()}
      >
        {create.isPending ? 'Posting…' : 'Post comment'}
      </button>
    </section>
  );
}

function PageHistory({
  versions,
  loading,
  error,
  onRestore,
}: {
  versions?: PageVersion[];
  loading: boolean;
  error: boolean;
  onRestore: (versionId: string) => void;
}) {
  return (
    <section className="page-history" aria-label="Page history">
      <h2>History</h2>
      {loading && <p className="muted">Loading revisions…</p>}
      {error && <p role="alert">Could not load page history.</p>}
      {versions?.map((version) => (
        <article key={version.id}>
          <strong>Version {version.versionNumber}</strong>
          <span>{new Date(version.createdAt).toLocaleString()}</span>
          <p>{version.title}</p>
          <button className="text-button" onClick={() => onRestore(version.id)}>
            Restore
          </button>
        </article>
      ))}
    </section>
  );
}

function NotFoundPage() {
  return (
    <main id="main-content" className="login-shell">
      <h1>Page not found</h1>
      <Link to="/">Return home</Link>
    </main>
  );
}

export function App() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  return (
    <QueryClientProvider client={queryClient}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link to="/" className="brand" aria-label="Odoc home">
          odoc<span>•</span>
        </Link>
      </header>
      <Routes>
        <Route
          path="/"
          element={
            credentials ? (
              <Workspace
                credentials={credentials}
                onLogout={() => setCredentials(null)}
              />
            ) : (
              <LoginPage onLogin={setCredentials} />
            )
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </QueryClientProvider>
  );
}
