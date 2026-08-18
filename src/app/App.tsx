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
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AUTH_FORBIDDEN_EVENT,
  AUTH_SESSION_EXPIRED_EVENT,
  odocApi,
  fetchAuthenticatedImage,
  readCsrfToken,
  type AuthSession,
  type Credentials,
  type PasswordChange,
  type RegistrationCredentials,
  type RegistrationPolicy,
  type Page,
  type PageVersion,
  type RepositoryBinding,
  type Space,
  type Workspace as WorkspaceInfo,
  type WorkspaceInvitation,
  type WorkspaceMember,
  type WorkspaceGroup,
  type WorkspaceGroupMember,
} from '../shared/api';
import { Button } from '../shared/ui/Button';
import { Dialog } from '../shared/ui/Dialog';
import { ComponentCatalog } from '../shared/ui/ComponentCatalog';
import { EmptyState } from '../shared/ui/Feedback';
import { FormField } from '../shared/ui/FormField';
import { type RichTextEditorController } from './RichDocument';
import { getRuntimeConfig } from '../shared/config/runtimeConfig';
import { AppErrorBoundary } from './AppErrorBoundary';
import { safeLocalReturnPath } from './authNavigation';
import { AppRoutes } from '../routes/AppRoutes';

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

const AUTH_LOGOUT_STORAGE_KEY = 'odoc.auth.logout';

function LoginPage({
  onLogin,
  onRequestPasswordRecovery,
  onCompletePasswordRecovery,
  registrationPolicy,
  authNotice,
}: {
  onLogin: (
    credentials: RegistrationCredentials,
    createAccount: boolean,
  ) => Promise<void>;
  onRequestPasswordRecovery: (email: string) => Promise<void>;
  onCompletePasswordRecovery: (input: {
    verifier: string;
    newPassword: string;
  }) => Promise<void>;
  registrationPolicy: RegistrationPolicy | null;
  authNotice: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [createAccount, setCreateAccount] = useState(false);
  const [invitationVerifier, setInvitationVerifier] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<
    'request' | 'complete' | null
  >(null);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirmation, setRecoveryConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onLogin(
        {
          email,
          password,
          ...(createAccount && registrationPolicy?.inviteOnly
            ? { invitationVerifier }
            : {}),
        },
        createAccount,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not sign you in. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await onRequestPasswordRecovery(email);
      setRecoveryStep('complete');
      setNotice(
        'If an account exists for that email, a reset code has been sent. In local Docker, open Mailpit on port 8025.',
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not request a password reset. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function completeRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (recoveryPassword !== recoveryConfirmation) {
      setError('The new passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await onCompletePasswordRecovery({
        verifier: recoveryCode,
        newPassword: recoveryPassword,
      });
      setRecoveryStep(null);
      setRecoveryCode('');
      setRecoveryPassword('');
      setRecoveryConfirmation('');
      setPassword('');
      setNotice('Password updated. You can sign in with your new password.');
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not reset your password. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="login-shell">
      <DocumentMetadata title="Sign in" />
      <section className="login-card" aria-labelledby="welcome-heading">
        <p className="eyebrow">Documentation workspace</p>
        <h1 id="welcome-heading">Build a home for what your team knows.</h1>
        <p className="lede">
          Sign in with your Odoc email and password.{' '}
          {registrationPolicy?.inviteOnly
            ? 'This deployment is invite-only: use the one-time workspace invitation code you received when creating an account.'
            : registrationPolicy?.registrationEnabled
              ? 'You can create an account with a verified email address.'
              : 'New local-account registration is disabled by this deployment.'}
        </p>
        {recoveryStep === 'request' ? (
          <form onSubmit={requestRecovery} className="stack-form">
            <FormField id="recovery-email" label="Email">
              <input
                id="recovery-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </FormField>
            {error && <p role="alert">{error}</p>}
            {notice && <p role="status">{notice}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Email reset code'}
            </Button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setRecoveryStep(null);
                setError(null);
              }}
            >
              Back to sign in
            </button>
          </form>
        ) : recoveryStep === 'complete' ? (
          <form onSubmit={completeRecovery} className="stack-form">
            {notice && <p role="status">{notice}</p>}
            <FormField id="recovery-code" label="Reset code">
              <input
                id="recovery-code"
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value)}
                autoComplete="one-time-code"
                required
              />
            </FormField>
            <FormField id="recovery-password" label="New password">
              <input
                id="recovery-password"
                type="password"
                value={recoveryPassword}
                onChange={(event) => setRecoveryPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </FormField>
            <FormField id="recovery-confirmation" label="Confirm new password">
              <input
                id="recovery-confirmation"
                type="password"
                value={recoveryConfirmation}
                onChange={(event) =>
                  setRecoveryConfirmation(event.target.value)
                }
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </FormField>
            {error && <p role="alert">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Resetting…' : 'Reset password'}
            </Button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setRecoveryStep('request');
                setError(null);
              }}
            >
              Send another code
            </button>
          </form>
        ) : (
          <form onSubmit={submit} className="stack-form">
            <FormField id="login-email" label="Email">
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </FormField>
            <FormField id="login-password" label="Password">
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  createAccount ? 'new-password' : 'current-password'
                }
                minLength={12}
                required
              />
            </FormField>
            {createAccount && registrationPolicy?.inviteOnly && (
              <FormField
                id="workspace-invitation-code"
                label="Workspace invitation code"
              >
                <input
                  id="workspace-invitation-code"
                  value={invitationVerifier}
                  onChange={(event) =>
                    setInvitationVerifier(event.target.value)
                  }
                  autoComplete="one-time-code"
                  maxLength={256}
                  required
                />
              </FormField>
            )}
            {error && <p role="alert">{error}</p>}
            {authNotice && <p role="status">{authNotice}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Working…'
                : createAccount
                  ? 'Create account'
                  : 'Sign in'}
            </Button>
            {registrationPolicy?.registrationEnabled && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setCreateAccount((current) => !current);
                  setError(null);
                  setInvitationVerifier('');
                }}
              >
                {createAccount
                  ? 'I already have an account'
                  : registrationPolicy.inviteOnly
                    ? 'Create an account with an invitation code'
                    : 'Create an account'}
              </button>
            )}
            {!createAccount && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setRecoveryStep('request');
                  setError(null);
                  setNotice(null);
                }}
              >
                Forgot password?
              </button>
            )}
          </form>
        )}
      </section>
    </main>
  );
}

/**
 * Consumes an invitation verifier from the fragment exactly once. Fragments are
 * not transmitted to the server; after the bounded POST exchange we remove it
 * from the visible/current URL before any sign-in or acceptance flow continues.
 */
function InvitationAcceptancePage({
  credentials,
  authState,
}: {
  credentials: Credentials | null;
  authState: 'checking' | 'anonymous' | 'ready';
}) {
  const { routeId } = useParams();
  const navigate = useNavigate();
  const started = useRef(false);
  const [status, setStatus] = useState<'working' | 'signin' | 'accepted' | 'error'>('working');
  const [message, setMessage] = useState('Checking this invitation…');

  useEffect(() => {
    if (!routeId || started.current) return;
    started.current = true;
    const verifier = new URLSearchParams(window.location.hash.slice(1)).get('v');
    // A fragment has already entered the initial browser history entry. This
    // removes it from the visible/current entry before any later navigation,
    // referrer, telemetry, or copied link can replay it.
    window.history.replaceState(null, '', `/invitations/${routeId}`);
    if (!verifier) {
      queueMicrotask(() => {
        setStatus('signin');
        setMessage('Sign in with the invited email address to continue.');
      });
      return;
    }
    void odocApi.exchangeWorkspaceInvitation(routeId, verifier).then(
      () => {
        setStatus('signin');
        setMessage('Invitation confirmed. Sign in with the invited email address to join the workspace.');
      },
      (reason: unknown) => {
        setStatus('error');
        setMessage(reason instanceof Error ? reason.message : 'This invitation is invalid or expired.');
      },
    );
  }, [routeId]);

  useEffect(() => {
    if (status !== 'signin' || authState !== 'ready' || !credentials) return;
    queueMicrotask(() => {
      setStatus('working');
      setMessage('Joining workspace…');
    });
    void odocApi.acceptWorkspaceInvitation(credentials).then(
      () => {
        setStatus('accepted');
        setMessage('You joined the workspace.');
        void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        void queryClient.invalidateQueries({ queryKey: ['spaces'] });
        navigate('/', { replace: true });
      },
      (reason: unknown) => {
        setStatus('error');
        setMessage(reason instanceof Error ? reason.message : 'Could not accept this invitation.');
      },
    );
  }, [authState, credentials, navigate, status]);

  const returnTo = `/invitations/${routeId ?? ''}`;
  return (
    <main id="main-content" className="login-shell">
      <DocumentMetadata title="Join workspace" />
      <section className="login-card" aria-live="polite">
        <p className="eyebrow">Workspace invitation</p>
        <h1>Join a workspace</h1>
        <p role={status === 'error' ? 'alert' : 'status'}>{message}</p>
        {status === 'signin' && authState === 'anonymous' && (
          <Link className="button-link" to={`/?returnTo=${encodeURIComponent(returnTo)}`}>
            Sign in to continue
          </Link>
        )}
        {status === 'error' && <Link to="/">Return to sign in</Link>}
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
  session,
  onLogout,
  onVerifyEmail,
  onResendEmailVerification,
  onPasswordChange,
}: {
  credentials: Credentials;
  session: AuthSession;
  onLogout: () => void;
  onVerifyEmail: (verifier: string) => Promise<void>;
  onResendEmailVerification: () => Promise<void>;
  onPasswordChange: (input: PasswordChange) => Promise<void>;
}) {
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newRepositoryOpen, setNewRepositoryOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
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
    queryFn: ({ signal }) => odocApi.listSpaces(credentials, signal),
  });
  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: ({ signal }) => odocApi.listWorkspaces(credentials, signal),
  });
  const selectedWorkspace = workspaces.data?.find(
    (workspace) => workspace.id === (selectedWorkspaceId ?? selectedSpace?.workspaceId),
  );
  useEffect(() => {
    const firstWorkspace = workspaces.data?.[0];
    if (!selectedWorkspaceId && firstWorkspace) {
      queueMicrotask(() => setSelectedWorkspaceId(firstWorkspace.id));
    }
  }, [selectedWorkspaceId, workspaces.data]);
  const visibleSpaces = spaces.data?.filter(
    (space) => space.workspaceId === selectedWorkspace?.id,
  );
  const members = useQuery({
    queryKey: ['workspace-members', selectedWorkspace?.id],
    queryFn: ({ signal }) =>
      odocApi.listWorkspaceMembers(credentials, selectedWorkspace!.id, signal),
    enabled: membersOpen && selectedWorkspace?.role === 'OWNER',
  });
  const invitations = useQuery({
    queryKey: ['workspace-invitations', selectedWorkspace?.id],
    queryFn: ({ signal }) =>
      odocApi.listWorkspaceInvitations(
        credentials,
        selectedWorkspace!.id,
        signal,
      ),
    enabled: membersOpen && selectedWorkspace?.role === 'OWNER',
  });
  const groups = useQuery({
    queryKey: ['workspace-groups', selectedWorkspace?.id],
    queryFn: ({ signal }) =>
      odocApi.listWorkspaceGroups(credentials, selectedWorkspace!.id, signal),
    enabled: membersOpen && selectedWorkspace?.role === 'OWNER',
  });
  const selectedGroup = groups.data?.find((group) => group.id === selectedGroupId) ?? null;
  useEffect(() => {
    const firstGroup = groups.data?.[0];
    if (!selectedGroupId && firstGroup) {
      queueMicrotask(() => setSelectedGroupId(firstGroup.id));
    }
  }, [groups.data, selectedGroupId]);
  const groupMembers = useQuery({
    queryKey: ['workspace-group-members', selectedWorkspace?.id, selectedGroup?.id],
    queryFn: () => odocApi.listWorkspaceGroupMembers(
      credentials, selectedWorkspace!.id, selectedGroup!.id,
    ),
    enabled: membersOpen && selectedWorkspace?.role === 'OWNER' && selectedGroup !== null,
  });
  const systemInfo = useQuery({
    queryKey: ['system-info'],
    queryFn: ({ signal }) => odocApi.systemInfo(credentials, signal),
    retry: false,
  });
  const pages = useQuery({
    queryKey: ['pages', selectedSpace?.id],
    queryFn: () => odocApi.listPages(credentials, selectedSpace!.id),
    enabled: selectedSpace !== null,
  });
  const results = useQuery({
    queryKey: ['search', search],
    queryFn: ({ signal }) => odocApi.search(credentials, search, signal),
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
  const createWorkspace = useMutation({
    mutationFn: (name: string) => odocApi.createWorkspace(credentials, name),
    onSuccess: (workspace) => {
      setSelectedWorkspaceId(workspace.id);
      setSelectedSpace(null);
      setSelectedPage(null);
      setNewWorkspaceOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
  const updateWorkspace = useMutation({
    mutationFn: (input: { name: string }) =>
      odocApi.updateWorkspace(
        credentials,
        selectedWorkspace!.id,
        selectedWorkspace!.revision,
        input.name,
      ),
    onSuccess: () => {
      setWorkspaceSettingsOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
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
  const inviteWorkspaceMember = useMutation({
    mutationFn: (email: string) =>
      odocApi.createWorkspaceInvitation(
        credentials,
        selectedWorkspace!.id,
        email,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['workspace-invitations', selectedWorkspace?.id],
      });
    },
  });
  const revokeWorkspaceInvitation = useMutation({
    mutationFn: (invitation: WorkspaceInvitation) =>
      odocApi.revokeWorkspaceInvitation(
        credentials,
        selectedWorkspace!.id,
        invitation.id,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['workspace-invitations', selectedWorkspace?.id],
      });
    },
  });
  const removeWorkspaceMember = useMutation({
    mutationFn: (member: WorkspaceMember) =>
      odocApi.removeWorkspaceMember(
        credentials,
        selectedWorkspace!.id,
        member.id,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['workspace-members', selectedWorkspace?.id],
      });
    },
  });
  const transferWorkspaceOwnership = useMutation({
    mutationFn: (member: WorkspaceMember) =>
      odocApi.transferWorkspaceOwnership(
        credentials,
        selectedWorkspace!.id,
        member.userId,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-members', selectedWorkspace?.id] });
    },
  });
  const createWorkspaceGroup = useMutation({
    mutationFn: (name: string) =>
      odocApi.createWorkspaceGroup(credentials, selectedWorkspace!.id, name),
    onSuccess: (group) => {
      setSelectedGroupId(group.id);
      void queryClient.invalidateQueries({ queryKey: ['workspace-groups', selectedWorkspace?.id] });
    },
  });
  const addWorkspaceGroupMember = useMutation({
    mutationFn: (userId: string) => odocApi.addWorkspaceGroupMember(
      credentials, selectedWorkspace!.id, selectedGroup!.id, userId,
    ),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ['workspace-group-members', selectedWorkspace?.id, selectedGroup?.id],
      }),
  });
  const removeWorkspaceGroupMember = useMutation({
    mutationFn: (userId: string) => odocApi.removeWorkspaceGroupMember(
      credentials, selectedWorkspace!.id, selectedGroup!.id, userId,
    ),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ['workspace-group-members', selectedWorkspace?.id, selectedGroup?.id],
      }),
  });

  const showSpace = (space: Space) => {
    if (
      (space.id !== selectedSpace?.id || selectedPage !== null) &&
      !canLeavePageEditor()
    )
      return;
    setSelectedSpace(space);
    setSelectedWorkspaceId(space.workspaceId);
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
      <DocumentMetadata
        title={selectedPage?.title ?? selectedSpace?.name ?? 'Workspace'}
      />
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
        {visibleSpaces?.map((space) => (
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
        {selectedWorkspace && visibleSpaces?.length === 0 && (
          <p className="muted">Create your first space to begin.</p>
        )}
      </aside>
      <section className="workspace-content">
        <div className="toolbar">
          <label className="workspace-switcher">
            Workspace
            <select
              value={selectedWorkspace?.id ?? ''}
              onChange={(event) => {
                if (!canLeavePageEditor()) return;
                const workspaceId = event.target.value;
                setSelectedWorkspaceId(workspaceId);
                setSelectedSpace(
                  spaces.data?.find((space) => space.workspaceId === workspaceId) ?? null,
                );
                setSelectedPage(null);
                setEditingPageId(null);
              }}
            >
              {workspaces.data?.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
          </label>
          <button className="secondary" onClick={() => setNewWorkspaceOpen(true)}>
            New workspace
          </button>
          <label className="search-box">
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search pages"
            />
          </label>
          {systemInfo.data?.status === 'ok' && (
            <span className="service-status" role="status">
              {systemInfo.data.name} API connected
            </span>
          )}
          {!session.emailVerified && (
            <div className="verification-notice" role="status">
              <span>Verify your email to secure your account.</span>
              <button
                className="secondary"
                onClick={() => setVerificationOpen(true)}
              >
                Verify email
              </button>
            </div>
          )}
          {selectedWorkspace?.role === 'OWNER' && (
            <>
              <button className="secondary" onClick={() => setMembersOpen(true)}>People</button>
              <button className="secondary" onClick={() => setWorkspaceSettingsOpen(true)}>Workspace settings</button>
            </>
          )}
          <button className="secondary" onClick={() => setAccountOpen(true)}>
            Account
          </button>
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
      {membersOpen && selectedWorkspace?.role === 'OWNER' && (
        <WorkspaceMembersDialog
          workspace={selectedWorkspace}
          members={members.data ?? []}
          invitations={invitations.data ?? []}
          groups={groups.data ?? []}
          selectedGroup={selectedGroup}
          groupMembers={groupMembers.data ?? []}
          groupMembersLoading={groupMembers.isPending}
          groupMembersError={groupMembers.error instanceof Error ? groupMembers.error.message : undefined}
          loading={members.isPending}
          loadingError={
            members.isError
              ? members.error instanceof Error
                ? members.error.message
                : 'Could not load workspace members.'
              : undefined
          }
          invitationsLoading={invitations.isPending}
          invitationsError={
            invitations.isError
              ? invitations.error instanceof Error
                ? invitations.error.message
                : 'Could not load workspace invitations.'
              : undefined
          }
          inviting={inviteWorkspaceMember.isPending}
          inviteError={
            inviteWorkspaceMember.isError
              ? inviteWorkspaceMember.error instanceof Error
                ? inviteWorkspaceMember.error.message
                : 'Could not invite that account.'
              : undefined
          }
          removingMemberId={
            removeWorkspaceMember.isPending
              ? removeWorkspaceMember.variables?.id
              : undefined
          }
          removeError={
            removeWorkspaceMember.isError
              ? removeWorkspaceMember.error instanceof Error
                ? removeWorkspaceMember.error.message
                : 'Could not remove that member.'
              : undefined
          }
          revokingInvitationId={
            revokeWorkspaceInvitation.isPending
              ? revokeWorkspaceInvitation.variables?.id
              : undefined
          }
          revokeInvitationError={
            revokeWorkspaceInvitation.isError
              ? revokeWorkspaceInvitation.error instanceof Error
                ? revokeWorkspaceInvitation.error.message
                : 'Could not revoke that invitation.'
              : undefined
          }
          onClose={() => setMembersOpen(false)}
          onInvite={(email) => inviteWorkspaceMember.mutate(email)}
          onRemove={(member) => removeWorkspaceMember.mutate(member)}
          onRevokeInvitation={(invitation) =>
            revokeWorkspaceInvitation.mutate(invitation)
          }
          onTransferOwnership={(member) => transferWorkspaceOwnership.mutate(member)}
          transferringUserId={transferWorkspaceOwnership.isPending ? transferWorkspaceOwnership.variables?.userId : undefined}
          onCreateGroup={(name) => createWorkspaceGroup.mutate(name)}
          creatingGroup={createWorkspaceGroup.isPending}
          groupError={createWorkspaceGroup.error instanceof Error ? createWorkspaceGroup.error.message : undefined}
          onSelectGroup={(group) => setSelectedGroupId(group.id)}
          onAddGroupMember={(userId) => addWorkspaceGroupMember.mutate(userId)}
          addingGroupMember={addWorkspaceGroupMember.isPending}
          addGroupMemberError={addWorkspaceGroupMember.error instanceof Error ? addWorkspaceGroupMember.error.message : undefined}
          onRemoveGroupMember={(userId) => removeWorkspaceGroupMember.mutate(userId)}
          removingGroupMemberId={removeWorkspaceGroupMember.isPending ? removeWorkspaceGroupMember.variables : undefined}
          removeGroupMemberError={removeWorkspaceGroupMember.error instanceof Error ? removeWorkspaceGroupMember.error.message : undefined}
        />
      )}
      {newWorkspaceOpen && (
        <WorkspaceDialog
          title="Create workspace"
          busy={createWorkspace.isPending}
          error={createWorkspace.error instanceof Error ? createWorkspace.error.message : undefined}
          onClose={() => setNewWorkspaceOpen(false)}
          onSubmit={(name) => createWorkspace.mutate(name)}
        />
      )}
      {workspaceSettingsOpen && selectedWorkspace && (
        <WorkspaceDialog
          title="Rename workspace"
          initialName={selectedWorkspace.name}
          busy={updateWorkspace.isPending}
          error={updateWorkspace.error instanceof Error ? updateWorkspace.error.message : undefined}
          onClose={() => setWorkspaceSettingsOpen(false)}
          onSubmit={(name) => updateWorkspace.mutate({ name })}
        />
      )}
      {accountOpen && (
        <AccountSecurityDialog
          email={session.email}
          onClose={() => setAccountOpen(false)}
          onSubmit={async (input) => {
            await onPasswordChange(input);
            setAccountOpen(false);
          }}
        />
      )}
      {verificationOpen && (
        <EmailVerificationDialog
          email={session.email}
          onClose={() => setVerificationOpen(false)}
          onVerify={async (verifier) => {
            await onVerifyEmail(verifier);
            setVerificationOpen(false);
          }}
          onResend={onResendEmailVerification}
        />
      )}
    </main>
  );
}

function EmptyWorkspace({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      eyebrow="Get started"
      title="Put your team’s knowledge somewhere it can grow."
      action={<Button onClick={onCreate}>Create a space</Button>}
    >
      <p>Create a space, add a page, and search it immediately.</p>
    </EmptyState>
  );
}

function AccountSecurityDialog({
  email,
  onClose,
  onSubmit,
}: {
  email: string;
  onClose: () => void;
  onSubmit: (input: PasswordChange) => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      isOpen
      onClose={onClose}
      className="dialog account-dialog"
      title="Account security"
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          if (newPassword !== confirmation) {
            setError('The new passwords do not match.');
            return;
          }
          setBusy(true);
          void onSubmit({ currentPassword, newPassword })
            .catch((reason: unknown) => {
              setError(
                reason instanceof Error
                  ? reason.message
                  : 'Could not change your password. Please try again.',
              );
            })
            .finally(() => setBusy(false));
        }}
      >
        <p className="muted">
          Signed in as <strong>{email}</strong>
        </p>
        <FormField id="current-password" label="Current password">
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </FormField>
        <FormField id="new-password" label="New password">
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </FormField>
        <FormField id="confirm-password" label="Confirm new password">
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
        </FormField>
        <p className="muted">
          Changing your password signs out every existing browser session and
          keeps this browser signed in with a new session.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function EmailVerificationDialog({
  email,
  onClose,
  onVerify,
  onResend,
}: {
  email: string;
  onClose: () => void;
  onVerify: (verifier: string) => Promise<void>;
  onResend: () => Promise<void>;
}) {
  const [verifier, setVerifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      isOpen
      onClose={onClose}
      className="dialog"
      title="Verify your email"
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setBusy(true);
          void onVerify(verifier)
            .catch((reason: unknown) => {
              setError(
                reason instanceof Error
                  ? reason.message
                  : 'Could not verify that code. Please try again.',
              );
            })
            .finally(() => setBusy(false));
        }}
      >
        <p className="muted">
          Enter the one-time code sent to <strong>{email}</strong>. In local
          Docker, messages are available in Mailpit on port 8025.
        </p>
        <FormField id="email-verification-code" label="Verification code">
          <input
            id="email-verification-code"
            value={verifier}
            onChange={(event) => setVerifier(event.target.value)}
            autoComplete="one-time-code"
            required
          />
        </FormField>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify email'}
          </button>
        </div>
        <button
          className="text-button"
          type="button"
          disabled={busy || resending}
          onClick={() => {
            setError(null);
            setNotice(null);
            setResending(true);
            void onResend()
              .then(() => setNotice('A fresh verification code has been sent.'))
              .catch((reason: unknown) => {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : 'Could not resend the verification email.',
                );
              })
              .finally(() => setResending(false));
          }}
        >
          {resending ? 'Sending…' : 'Send a new code'}
        </button>
      </form>
    </Dialog>
  );
}

function EmailVerificationScreen({
  email,
  onVerify,
  onResend,
  onLogout,
}: {
  email: string;
  onVerify: (verifier: string) => Promise<void>;
  onResend: () => Promise<void>;
  onLogout: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <main id="main-content" className="login-shell">
      <DocumentMetadata title="Verify your email" />
      <section className="login-card" aria-labelledby="verify-email-heading">
        <p className="eyebrow">One more step</p>
        <h1 id="verify-email-heading">Verify your email</h1>
        <p>
          We sent a one-time code to <strong>{email}</strong>. Verify it before
          Odoc loads any workspace or document data.
        </p>
        <div className="dialog-actions">
          <button onClick={() => setDialogOpen(true)}>
            Enter verification code
          </button>
          <button className="secondary" onClick={onLogout}>
            Log out
          </button>
        </div>
      </section>
      {dialogOpen && (
        <EmailVerificationDialog
          email={email}
          onClose={() => setDialogOpen(false)}
          onVerify={async (verifier) => {
            await onVerify(verifier);
            setDialogOpen(false);
          }}
          onResend={onResend}
        />
      )}
    </main>
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

function WorkspaceMembersDialog({
  workspace,
  members,
  invitations,
  groups,
  selectedGroup,
  groupMembers,
  groupMembersLoading,
  groupMembersError,
  loading,
  loadingError,
  invitationsLoading,
  invitationsError,
  inviting,
  inviteError,
  removingMemberId,
  removeError,
  revokingInvitationId,
  revokeInvitationError,
  onClose,
  onInvite,
  onRemove,
  onRevokeInvitation,
  onTransferOwnership,
  transferringUserId,
  onCreateGroup,
  creatingGroup,
  groupError,
  onSelectGroup,
  onAddGroupMember,
  addingGroupMember,
  addGroupMemberError,
  onRemoveGroupMember,
  removingGroupMemberId,
  removeGroupMemberError,
}: {
  workspace: WorkspaceInfo;
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
  groups: WorkspaceGroup[];
  selectedGroup: WorkspaceGroup | null;
  groupMembers: WorkspaceGroupMember[];
  groupMembersLoading: boolean;
  groupMembersError?: string;
  loading: boolean;
  loadingError?: string;
  invitationsLoading: boolean;
  invitationsError?: string;
  inviting: boolean;
  inviteError?: string;
  removingMemberId?: string;
  removeError?: string;
  revokingInvitationId?: string;
  revokeInvitationError?: string;
  onClose: () => void;
  onInvite: (email: string) => void;
  onRemove: (member: WorkspaceMember) => void;
  onRevokeInvitation: (invitation: WorkspaceInvitation) => void;
  onTransferOwnership: (member: WorkspaceMember) => void;
  transferringUserId?: string;
  onCreateGroup: (name: string) => void;
  creatingGroup: boolean;
  groupError?: string;
  onSelectGroup: (group: WorkspaceGroup) => void;
  onAddGroupMember: (userId: string) => void;
  addingGroupMember: boolean;
  addGroupMemberError?: string;
  onRemoveGroupMember: (userId: string) => void;
  removingGroupMemberId?: string;
  removeGroupMemberError?: string;
}) {
  const [email, setEmail] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupMemberUserId, setGroupMemberUserId] = useState('');
  const groupMemberIds = new Set(groupMembers.map((member) => member.userId));
  return (
    <Dialog
      isOpen
      onClose={onClose}
      className="dialog members-dialog"
      title={`Members — ${workspace.name}`}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onInvite(email);
        }}
        className="stack-form"
      >
        <label>
          Invite by email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="teammate@example.com"
            required
          />
        </label>
        <p className="muted">
          Odoc sends a one-time invitation code. The recipient can create an
          account if needed, then use Join workspace to redeem the code.
        </p>
        {inviteError && <p role="alert">{inviteError}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
          <button disabled={inviting}>
            {inviting ? 'Inviting…' : 'Invite member'}
          </button>
        </div>
      </form>
      <section
        className="workspace-members"
        aria-labelledby="workspace-members-heading"
      >
        <h3 id="workspace-members-heading">Current members</h3>
        {loading && <p>Loading members…</p>}
        {loadingError && <p role="alert">{loadingError}</p>}
        {!loading && !loadingError && (
          <ul>
            {members.map((member) => (
              <li key={member.id}>
                <span>
                  <strong>{member.email}</strong>
                  <small>{member.role === 'OWNER' ? 'Owner' : 'Member'}</small>
                </span>
                {member.role === 'MEMBER' && (
                  <span className="member-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={transferringUserId === member.userId}
                      onClick={() => {
                        if (window.confirm(`Transfer ownership of ${workspace.name} to ${member.email}? You will become a member.`)) {
                          onTransferOwnership(member);
                        }
                      }}
                    >
                      {transferringUserId === member.userId ? 'Transferring…' : 'Make owner'}
                    </button>
                    <button
                      type="button"
                      className="secondary danger"
                      disabled={removingMemberId === member.id}
                      onClick={() => {
                        if (window.confirm(`Remove ${member.email} from ${workspace.name}?`)) onRemove(member);
                      }}
                    >
                      {removingMemberId === member.id ? 'Removing…' : 'Remove'}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {removeError && <p role="alert">{removeError}</p>}
      </section>
      <section
        className="workspace-members"
        aria-labelledby="workspace-invitations-heading"
      >
        <h3 id="workspace-invitations-heading">Pending invitations</h3>
        {invitationsLoading && <p>Loading invitations…</p>}
        {invitationsError && <p role="alert">{invitationsError}</p>}
        {!invitationsLoading &&
          !invitationsError &&
          invitations.length === 0 && (
            <p className="muted">No active invitations.</p>
          )}
        {!invitationsLoading && !invitationsError && invitations.length > 0 && (
          <ul>
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                <span>
                  <strong>{invitation.email}</strong>
                  <small>
                    Expires {new Date(invitation.expiresAt).toLocaleString()}
                  </small>
                </span>
                <button
                  type="button"
                  className="secondary danger"
                  disabled={revokingInvitationId === invitation.id}
                  onClick={() => onRevokeInvitation(invitation)}
                >
                  {revokingInvitationId === invitation.id
                    ? 'Revoking…'
                    : 'Revoke'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {revokeInvitationError && <p role="alert">{revokeInvitationError}</p>}
      </section>
      <section className="workspace-members" aria-labelledby="workspace-groups-heading">
        <h3 id="workspace-groups-heading">Groups</h3>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateGroup(groupName);
            setGroupName('');
          }}
        >
          <label>
            New group name
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} required />
          </label>
          <button disabled={creatingGroup}>{creatingGroup ? 'Creating…' : 'Create group'}</button>
        </form>
        {groupError && <p role="alert">{groupError}</p>}
        {groups.length === 0 ? <p className="muted">No groups yet.</p> : (
          <ul>{groups.map((group) => <li key={group.id}><span><strong>{group.name}</strong><small>{group.status.toLowerCase()}</small></span><button type="button" className="secondary" onClick={() => onSelectGroup(group)}>{selectedGroup?.id === group.id ? 'Selected' : 'Manage'}</button></li>)}</ul>
        )}
        {selectedGroup && (
          <section className="group-members" aria-labelledby="selected-group-heading">
            <h4 id="selected-group-heading">{selectedGroup.name} members</h4>
            <form className="inline-form" onSubmit={(event) => {
              event.preventDefault();
              onAddGroupMember(groupMemberUserId);
              setGroupMemberUserId('');
            }}>
              <label>
                Add workspace member
                <select value={groupMemberUserId} onChange={(event) => setGroupMemberUserId(event.target.value)} required>
                  <option value="">Choose a member</option>
                  {members.filter((member) => !groupMemberIds.has(member.userId)).map((member) => (
                    <option key={member.userId} value={member.userId}>{member.email}</option>
                  ))}
                </select>
              </label>
              <button disabled={addingGroupMember || groupMemberUserId === ''}>{addingGroupMember ? 'Adding…' : 'Add to group'}</button>
            </form>
            {addGroupMemberError && <p role="alert">{addGroupMemberError}</p>}
            {groupMembersLoading && <p>Loading group members…</p>}
            {groupMembersError && <p role="alert">{groupMembersError}</p>}
            {!groupMembersLoading && !groupMembersError && groupMembers.length === 0 && <p className="muted">No group members yet.</p>}
            {!groupMembersLoading && !groupMembersError && groupMembers.length > 0 && (
              <ul>{groupMembers.map((member) => <li key={member.userId}><span><strong>{member.email}</strong></span><button type="button" className="secondary danger" disabled={removingGroupMemberId === member.userId} onClick={() => onRemoveGroupMember(member.userId)}>{removingGroupMemberId === member.userId ? 'Removing…' : 'Remove'}</button></li>)}</ul>
            )}
            {removeGroupMemberError && <p role="alert">{removeGroupMemberError}</p>}
          </section>
        )}
      </section>
    </Dialog>
  );
}

function WorkspaceDialog({
  title,
  initialName = '',
  busy,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  initialName?: string;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <Dialog isOpen onClose={onClose} className="dialog" title={title}>
      <form className="stack-form" onSubmit={(event) => { event.preventDefault(); onSubmit(name); }}>
        <FormField id="workspace-name" label="Workspace name">
          <input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
        </FormField>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button disabled={busy}>{busy ? 'Saving…' : title}</button>
        </div>
      </form>
    </Dialog>
  );
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
    <Dialog isOpen onClose={onClose} className="dialog" title="Create a space">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ key, name, description });
        }}
        className="stack-form"
      >
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
    </Dialog>
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
    <Dialog isOpen onClose={onClose} className="dialog" title="Create a page">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(title);
        }}
        className="stack-form"
      >
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
    </Dialog>
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
    <Dialog
      isOpen
      onClose={onClose}
      className="dialog"
      title="Attach a GitHub repository"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(url);
        }}
        className="stack-form"
      >
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
    </Dialog>
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
      <DocumentMetadata title="Page not found" />
      <h1>Page not found</h1>
      <Link to="/">Return home</Link>
    </main>
  );
}

function ForbiddenPage() {
  return (
    <main id="main-content" className="login-shell">
      <DocumentMetadata title="Access denied" />
      <section className="login-card" aria-labelledby="forbidden-heading">
        <p className="eyebrow">Access denied</p>
        <h1 id="forbidden-heading">You do not have access to this page.</h1>
        <p>Ask a workspace administrator to review your permissions.</p>
        <Link to="/">Return home</Link>
      </section>
    </main>
  );
}

function DocumentMetadata({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} · Odoc`;
  }, [title]);
  return null;
}

function RuntimeConfigGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let active = true;
    void getRuntimeConfig().then(
      () => active && setState('ready'),
      () => active && setState('failed'),
    );
    return () => {
      active = false;
    };
  }, []);

  if (state === 'loading') {
    return (
      <main id="main-content" className="login-shell">
        Loading Odoc…
      </main>
    );
  }
  if (state === 'failed') {
    return (
      <main id="main-content" className="login-shell">
        <section
          className="login-card"
          role="alert"
          aria-labelledby="config-error-heading"
        >
          <p className="eyebrow">Configuration error</p>
          <h1 id="config-error-heading">Odoc could not start.</h1>
          <p>
            The public runtime configuration is missing or invalid. Check the
            deployment configuration and reload this page.
          </p>
        </section>
      </main>
    );
  }
  return <>{children}</>;
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [registrationPolicy, setRegistrationPolicy] =
    useState<RegistrationPolicy | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authState, setAuthState] = useState<
    'checking' | 'anonymous' | 'ready'
  >('checking');
  const authChannel = useRef<BroadcastChannel | null>(null);

  const establishSession = useCallback((nextSession: AuthSession) => {
    const csrfToken = readCsrfToken();
    if (!csrfToken) {
      throw new Error(
        'The browser did not receive a CSRF cookie. Check the local proxy configuration and try again.',
      );
    }
    setCredentials({ csrfToken });
    setSession(nextSession);
    setAuthState('ready');
  }, []);

  const clearAuthentication = useCallback((notice?: string) => {
    queryClient.clear();
    setCredentials(null);
    setSession(null);
    setAuthState('anonymous');
    setAuthNotice(notice ?? null);
  }, []);

  const navigateToSignIn = useCallback(() => {
    const currentPath = safeLocalReturnPath(
      `${location.pathname}${location.hash}`,
    );
    navigate(
      currentPath === '/'
        ? '/'
        : `/?returnTo=${encodeURIComponent(currentPath)}`,
      { replace: true },
    );
  }, [location.hash, location.pathname, navigate]);

  const broadcastLogout = useCallback(() => {
    authChannel.current?.postMessage({ type: 'logout' });
    // This fallback carries only a timestamp-like signal, never any credential or token.
    try {
      window.localStorage.setItem(AUTH_LOGOUT_STORAGE_KEY, String(Date.now()));
      window.localStorage.removeItem(AUTH_LOGOUT_STORAGE_KEY);
    } catch {
      // Private browsing/storage policies may disable this fallback; BroadcastChannel remains enough.
    }
  }, []);

  useEffect(() => {
    const signOutFromElsewhere = () => {
      clearAuthentication('You were signed out in another browser tab.');
      navigateToSignIn();
    };
    const handleExpiredSession = () => {
      clearAuthentication('Your session expired. Sign in again to continue.');
      navigateToSignIn();
    };
    const handleForbidden = () => navigate('/forbidden', { replace: true });
    const handleStorage = (event: StorageEvent) => {
      if (event.key === AUTH_LOGOUT_STORAGE_KEY) signOutFromElsewhere();
    };

    const channel =
      typeof BroadcastChannel === 'function'
        ? new BroadcastChannel('odoc-auth')
        : null;
    authChannel.current = channel;
    if (channel) {
      channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
        if (event.data?.type === 'logout') signOutFromElsewhere();
      };
    }
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpiredSession);
    window.addEventListener(AUTH_FORBIDDEN_EVENT, handleForbidden);
    window.addEventListener('storage', handleStorage);
    return () => {
      authChannel.current = null;
      channel?.close();
      window.removeEventListener(
        AUTH_SESSION_EXPIRED_EVENT,
        handleExpiredSession,
      );
      window.removeEventListener(AUTH_FORBIDDEN_EVENT, handleForbidden);
      window.removeEventListener('storage', handleStorage);
    };
  }, [clearAuthentication, navigate, navigateToSignIn]);

  useEffect(() => {
    let active = true;
    void odocApi.registrationPolicy().then(
      (policy) => active && setRegistrationPolicy(policy),
      () =>
        active &&
        setRegistrationPolicy({
          registrationEnabled: false,
          inviteOnly: false,
        }),
    );
    void odocApi.session().then(
      (existingSession) => {
        if (!active) return;
        try {
          establishSession(existingSession);
        } catch {
          setAuthState('anonymous');
        }
      },
      () => active && setAuthState('anonymous'),
    );
    return () => {
      active = false;
    };
  }, [establishSession]);

  const login = useCallback(
    async (input: RegistrationCredentials, createAccount: boolean) => {
      const nextSession = createAccount
        ? await odocApi.register(input)
        : await odocApi.login(input);
      establishSession(nextSession);
      setAuthNotice(null);
      const target = safeLocalReturnPath(
        new URLSearchParams(location.search).get('returnTo'),
      );
      if (target !== '/') navigate(target, { replace: true });
    },
    [establishSession, location.search, navigate],
  );

  const logout = useCallback(async () => {
    let notice: string | undefined;
    if (credentials) {
      try {
        await odocApi.logout(credentials);
      } catch {
        notice =
          'Odoc could not reach the server to revoke this session. This browser is signed out locally.';
      }
    }
    broadcastLogout();
    clearAuthentication(notice);
    navigateToSignIn();
  }, [broadcastLogout, clearAuthentication, credentials, navigateToSignIn]);

  const verifyEmail = useCallback(
    async (verifier: string) => {
      await odocApi.verifyEmail(credentials ?? undefined, verifier);
      setSession((current) =>
        current
          ? {
              ...current,
              emailVerified: true,
            }
          : current,
      );
    },
    [credentials],
  );

  const resendEmailVerification = useCallback(async () => {
    if (!credentials)
      throw new Error('Your session has expired. Please sign in again.');
    return odocApi.resendEmailVerification(credentials);
  }, [credentials]);

  const changePassword = useCallback(
    async (input: PasswordChange) => {
      if (!credentials)
        throw new Error('Your session has expired. Please sign in again.');
      const nextSession = await odocApi.changePassword(credentials, input);
      establishSession(nextSession);
    },
    [credentials, establishSession],
  );

  const requestPasswordRecovery = useCallback(
    (email: string) => odocApi.requestPasswordRecovery(email),
    [],
  );

  const completePasswordRecovery = useCallback(
    (input: { verifier: string; newPassword: string }) =>
      odocApi.completePasswordRecovery(input),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RuntimeConfigGate>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="site-header">
          <Link to="/" className="brand" aria-label="Odoc home">
            odoc<span>•</span>
          </Link>
        </header>
        <AppErrorBoundary>
            <AppRoutes
            home={
              authState === 'checking' ? (
                <main id="main-content" className="login-shell">
                  Checking your session…
                </main>
              ) : credentials && session ? (
                session.emailVerified ? (
                  <Workspace
                    credentials={credentials}
                    session={session}
                    onLogout={logout}
                    onVerifyEmail={verifyEmail}
                    onResendEmailVerification={resendEmailVerification}
                    onPasswordChange={changePassword}
                  />
                ) : (
                  <EmailVerificationScreen
                    email={session.email}
                    onVerify={verifyEmail}
                    onResend={resendEmailVerification}
                    onLogout={logout}
                  />
                )
              ) : (
                <LoginPage
                  onLogin={login}
                  onRequestPasswordRecovery={requestPasswordRecovery}
                  onCompletePasswordRecovery={completePasswordRecovery}
                  registrationPolicy={registrationPolicy}
                  authNotice={authNotice}
                />
              )
            }
            forbidden={<ForbiddenPage />}
            invitation={
              <InvitationAcceptancePage
                credentials={credentials}
                authState={authState}
              />
            }
            catalog={
              <>
                <DocumentMetadata title="Component catalog" />
                <ComponentCatalog />
              </>
            }
            notFound={<NotFoundPage />}
          />
        </AppErrorBoundary>
      </RuntimeConfigGate>
    </QueryClientProvider>
  );
}
