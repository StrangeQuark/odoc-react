import { getRuntimeConfig } from '../config/runtimeConfig';
import type { components } from '../../generated/odoc-api';
import type { components as ThinSliceComponents } from '../../generated/odoc-thin-slice-api';
import { contractMetadata } from './contractMetadata';

export type Credentials = {
  /** Public double-submit value paired with the HttpOnly session cookie. */
  csrfToken: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type PasswordChange = {
  currentPassword: string;
  newPassword: string;
};

export type PasswordRecovery = {
  verifier: string;
  newPassword: string;
};

export type AuthSession = {
  userId: string;
  email: string;
  expiresAt: string | null;
  emailVerified: boolean;
};

export type Space = {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  role: 'OWNER' | 'MEMBER';
};

export type WorkspaceMember = {
  id: string;
  userId: string;
  email: string;
  role: 'OWNER' | 'MEMBER';
  joinedAt: string;
};

export type WorkspaceInvitation = {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
};

export type Page = {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type PageVersion = {
  id: string;
  versionNumber: number;
  title: string;
  content: string;
  createdAt: string;
};

export type PageComment = {
  id: string;
  parentId: string | null;
  author: string;
  body: string;
  createdAt: string;
};

export type RepositoryBinding = {
  id: string;
  spaceId: string;
  githubUrl: string;
  owner: string;
  name: string;
  description: string;
  defaultBranch: string;
  stars: number;
  readmeContent: string;
  readmePath: string;
  syncedAt: string;
};

export type MediaAsset = {
  id: string;
  spaceId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
};

export type SystemInfo = {
  name: string;
  status: string;
  timestamp: string;
};

/**
 * Test-profile-only result used by the P0 thin vertical slice. This is kept
 * out of product screens, but is generated from the same Spring OpenAPI
 * contract and sent through the production transport/mocking path.
 */
export type ThinSliceCommand = {
  executionId: string;
  message: string;
  createdAt: string;
};

export type ApiProblemFieldError = {
  field: string;
  message: string;
};

export type ApiProblem = {
  detail: string;
  errors: ApiProblemFieldError[];
  instance?: string;
  requestId?: string;
  status: number;
  title: string;
  type?: string;
};

const DEFAULT_API_TIMEOUT_MS = 15_000;

/**
 * Stable transport error used by every feature. Screens can make their own
 * product decisions from `status`, while the safe server detail/request ID is
 * available for recovery and support without parsing an arbitrary string.
 */
export class ApiRequestError extends Error {
  readonly problem: ApiProblem;
  readonly retryAfter?: string;

  constructor(problem: ApiProblem, retryAfter?: string) {
    super(problem.detail);
    this.name = 'ApiRequestError';
    this.problem = problem;
    this.retryAfter = retryAfter ?? undefined;
  }
}

/**
 * The server contract is generated from the committed OpenAPI snapshot. Keep
 * the application model strict at this boundary: springdoc presently marks
 * record properties optional, but the UI cannot safely render a half-shaped
 * resource response.
 */
type ContractSchemas = components['schemas'];
type ContractSpace = ContractSchemas['SpaceResponse'];
type ContractWorkspace = ContractSchemas['WorkspaceResponse'];
type ContractWorkspaceMember = ContractSchemas['WorkspaceMemberResponse'];
type ContractWorkspaceInvitation =
  ContractSchemas['WorkspaceInvitationResponse'];
type ContractPage = ContractSchemas['PageResponse'];
type ContractPageVersion = ContractSchemas['PageVersionResponse'];
type ContractComment = ContractSchemas['PageCommentResponse'];
type ContractRepository = ContractSchemas['RepositoryBindingResponse'];
type ContractMedia = ContractSchemas['MediaAssetResponse'];
type ContractSystemInfo = ContractSchemas['SystemInfoResponse'];
type ContractThinSliceCommand =
  ThinSliceComponents['schemas']['ThinSliceCommandResponse'];

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`API contract violation: ${field} must be a string.`);
  }
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number') {
    throw new Error(`API contract violation: ${field} must be a number.`);
  }
  return value;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`API contract violation: ${field} must be a boolean.`);
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function toProblemFieldErrors(value: unknown): ApiProblemFieldError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const item = asRecord(candidate);
    if (
      item &&
      typeof item.field === 'string' &&
      typeof item.message === 'string'
    ) {
      return [{ field: item.field, message: item.message }];
    }
    return [];
  });
}

function toApiProblem(
  body: unknown,
  status: number,
  requestId: string | null,
): ApiProblem {
  const value = asRecord(body);
  const detail =
    value && typeof value.detail === 'string'
      ? value.detail
      : `Request failed (${status}).`;
  return {
    detail,
    errors: toProblemFieldErrors(value?.errors),
    instance:
      value && typeof value.instance === 'string' ? value.instance : undefined,
    requestId:
      (value && typeof value.requestId === 'string'
        ? value.requestId
        : requestId) ?? undefined,
    status: value && typeof value.status === 'number' ? value.status : status,
    title:
      value && typeof value.title === 'string' ? value.title : `HTTP ${status}`,
    type: value && typeof value.type === 'string' ? value.type : undefined,
  };
}

async function toApiRequestError(response: Response): Promise<ApiRequestError> {
  const rawBody = await response.text();
  let parsedBody: unknown = undefined;
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody) as unknown;
    } catch {
      // An intermediary can return non-JSON. Preserve the status and request
      // ID without exposing that body as an application-level error message.
    }
  }
  return new ApiRequestError(
    toApiProblem(
      parsedBody,
      response.status,
      response.headers.get('X-Request-Id'),
    ),
    response.headers.get('Retry-After') ?? undefined,
  );
}

function requestSignal(externalSignal?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DEFAULT_API_TIMEOUT_MS);

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      globalThis.clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

function timeoutProblem(): ApiRequestError {
  return new ApiRequestError({
    detail: 'The request timed out. Please try again.',
    errors: [],
    status: 408,
    title: 'Request timeout',
    type: 'https://odoc.local/problems/request-timeout',
  });
}

function createRequestId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  // A UUID is preferred; this safe fallback keeps correlation available in
  // constrained test/webview environments without encoding user data.
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function toSpace(value: ContractSpace): Space {
  return {
    id: requiredString(value.id, 'space.id'),
    workspaceId: requiredString(value.workspaceId, 'space.workspaceId'),
    key: requiredString(value.key, 'space.key'),
    name: requiredString(value.name, 'space.name'),
    description: value.description ?? '',
    createdAt: requiredString(value.createdAt, 'space.createdAt'),
    updatedAt: requiredString(value.updatedAt, 'space.updatedAt'),
  };
}

function toWorkspace(value: ContractWorkspace): Workspace {
  const role = requiredString(value.role, 'workspace.role');
  if (role !== 'OWNER' && role !== 'MEMBER') {
    throw new Error('API contract violation: workspace.role is invalid.');
  }
  return {
    id: requiredString(value.id, 'workspace.id'),
    name: requiredString(value.name, 'workspace.name'),
    role,
  };
}

function toWorkspaceMember(value: ContractWorkspaceMember): WorkspaceMember {
  const role = requiredString(value.role, 'workspaceMember.role');
  if (role !== 'OWNER' && role !== 'MEMBER') {
    throw new Error('API contract violation: workspaceMember.role is invalid.');
  }
  return {
    id: requiredString(value.id, 'workspaceMember.id'),
    userId: requiredString(value.userId, 'workspaceMember.userId'),
    email: requiredString(value.email, 'workspaceMember.email'),
    role,
    joinedAt: requiredString(value.joinedAt, 'workspaceMember.joinedAt'),
  };
}

function toWorkspaceInvitation(
  value: ContractWorkspaceInvitation,
): WorkspaceInvitation {
  return {
    id: requiredString(value.id, 'workspaceInvitation.id'),
    email: requiredString(value.email, 'workspaceInvitation.email'),
    expiresAt: requiredString(value.expiresAt, 'workspaceInvitation.expiresAt'),
    createdAt: requiredString(value.createdAt, 'workspaceInvitation.createdAt'),
  };
}

function toPage(value: ContractPage): Page {
  return {
    id: requiredString(value.id, 'page.id'),
    spaceId: requiredString(value.spaceId, 'page.spaceId'),
    parentId: value.parentId ?? null,
    title: requiredString(value.title, 'page.title'),
    content: value.content ?? '',
    createdAt: requiredString(value.createdAt, 'page.createdAt'),
    updatedAt: requiredString(value.updatedAt, 'page.updatedAt'),
  };
}

function toPageVersion(value: ContractPageVersion): PageVersion {
  return {
    id: requiredString(value.id, 'pageVersion.id'),
    versionNumber: requiredNumber(
      value.versionNumber,
      'pageVersion.versionNumber',
    ),
    title: requiredString(value.title, 'pageVersion.title'),
    content: value.content ?? '',
    createdAt: requiredString(value.createdAt, 'pageVersion.createdAt'),
  };
}

function toComment(value: ContractComment): PageComment {
  return {
    id: requiredString(value.id, 'comment.id'),
    parentId: value.parentId ?? null,
    author: requiredString(value.author, 'comment.author'),
    body: requiredString(value.body, 'comment.body'),
    createdAt: requiredString(value.createdAt, 'comment.createdAt'),
  };
}

function toRepository(value: ContractRepository): RepositoryBinding {
  return {
    id: requiredString(value.id, 'repository.id'),
    spaceId: requiredString(value.spaceId, 'repository.spaceId'),
    githubUrl: requiredString(value.githubUrl, 'repository.githubUrl'),
    owner: requiredString(value.owner, 'repository.owner'),
    name: requiredString(value.name, 'repository.name'),
    description: value.description ?? '',
    defaultBranch: value.defaultBranch ?? '',
    stars: value.stars ?? 0,
    readmeContent: value.readmeContent ?? '',
    readmePath: value.readmePath ?? '',
    syncedAt: requiredString(value.syncedAt, 'repository.syncedAt'),
  };
}

function toMedia(value: ContractMedia): MediaAsset {
  return {
    id: requiredString(value.id, 'media.id'),
    spaceId: requiredString(value.spaceId, 'media.spaceId'),
    filename: requiredString(value.filename, 'media.filename'),
    contentType: requiredString(value.contentType, 'media.contentType'),
    sizeBytes: requiredNumber(value.sizeBytes, 'media.sizeBytes'),
    createdAt: requiredString(value.createdAt, 'media.createdAt'),
    url: requiredString(value.url, 'media.url'),
  };
}

function toSystemInfo(value: ContractSystemInfo): SystemInfo {
  return {
    name: requiredString(value.name, 'systemInfo.name'),
    status: requiredString(value.status, 'systemInfo.status'),
    timestamp: requiredString(value.timestamp, 'systemInfo.timestamp'),
  };
}

function toThinSliceCommand(value: ContractThinSliceCommand): ThinSliceCommand {
  return {
    executionId: requiredString(value.executionId, 'thinSlice.executionId'),
    message: requiredString(value.message, 'thinSlice.message'),
    createdAt: requiredString(value.createdAt, 'thinSlice.createdAt'),
  };
}

async function apiFetch<T>(
  path: string,
  credentials: Credentials | undefined,
  init: RequestInit = {},
): Promise<T> {
  const { apiBasePath } = await getRuntimeConfig();
  const headers = new Headers(init.headers);
  if (
    credentials?.csrfToken &&
    !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(init.method ?? 'GET')
  ) {
    headers.set('X-Odoc-Csrf', credentials.csrfToken);
  }
  if (!headers.has('X-Request-Id')) {
    headers.set('X-Request-Id', createRequestId());
  }
  headers.set('X-Odoc-Contract-Version', contractMetadata.version);
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const request = requestSignal(init.signal ?? undefined);
  let response: Response;
  try {
    response = await fetch(`${apiBasePath}${path}`, {
      ...init,
      // API responses may contain workspace content or identity data. Keep
      // React Query's in-memory cache as the only default client cache and
      // prevent browser HTTP caches from retaining the response.
      cache: 'no-store',
      credentials: 'same-origin',
      headers,
      signal: request.signal,
    });
  } catch (error) {
    if (request.timedOut()) throw timeoutProblem();
    throw error;
  } finally {
    request.cleanup();
  }
  if (!response.ok) {
    throw await toApiRequestError(response);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
}

export async function fetchAuthenticatedMedia(
  _credentials: Credentials,
  path: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const { apiBasePath } = await getRuntimeConfig();
  // Upload responses are canonical API paths (`/api/v1/media/{id}`), while
  // legacy callers may still pass a path relative to the configured API base.
  // Do not accidentally proxy `/api/v1/api/v1/...` for the canonical form.
  const requestUrl = path.startsWith(apiBasePath)
    ? path
    : `${apiBasePath}${path}`;
  const request = requestSignal(signal);
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: request.signal,
      headers: { 'X-Odoc-Contract-Version': contractMetadata.version },
    });
  } catch (error) {
    if (request.timedOut()) throw timeoutProblem();
    throw error;
  } finally {
    request.cleanup();
  }
  if (!response.ok)
    throw new Error(`Could not load media (${response.status})`);
  return response.blob();
}

// Repository README rendering still uses this name; page documents use the
// generic media path above so images and videos share one authenticated flow.
export const fetchAuthenticatedImage = fetchAuthenticatedMedia;

/** Reads only the non-HttpOnly half of the cookie/session CSRF pair. */
export function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = 'ODOC_CSRF=';
  const value = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

function toAuthSession(value: unknown): AuthSession {
  const record = asRecord(value);
  return {
    userId: requiredString(record?.userId, 'authSession.userId'),
    email: requiredString(record?.email, 'authSession.email'),
    expiresAt: typeof record?.expiresAt === 'string' ? record.expiresAt : null,
    emailVerified: requiredBoolean(
      record?.emailVerified,
      'authSession.emailVerified',
    ),
  };
}

export const odocApi = {
  register: (input: LoginCredentials) =>
    apiFetch<unknown>('/auth/register', undefined, {
      method: 'POST',
      body: JSON.stringify(input),
    }).then(toAuthSession),
  login: (input: LoginCredentials) =>
    apiFetch<unknown>('/auth/login', undefined, {
      method: 'POST',
      body: JSON.stringify(input),
    }).then(toAuthSession),
  session: (signal?: AbortSignal) =>
    apiFetch<unknown>('/auth/session', undefined, { signal }).then(
      toAuthSession,
    ),
  logout: (credentials: Credentials) =>
    apiFetch<void>('/auth/logout', credentials, { method: 'POST' }),
  changePassword: (credentials: Credentials, input: PasswordChange) =>
    apiFetch<unknown>('/auth/password', credentials, {
      method: 'POST',
      body: JSON.stringify(input),
    }).then(toAuthSession),
  requestPasswordRecovery: (email: string) =>
    apiFetch<void>('/auth/password-recovery/request', undefined, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  completePasswordRecovery: (input: PasswordRecovery) =>
    apiFetch<void>('/auth/password-recovery/complete', undefined, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  verifyEmail: (credentials: Credentials | undefined, verifier: string) =>
    apiFetch<void>('/auth/email-verification', credentials, {
      method: 'POST',
      body: JSON.stringify({ verifier }),
    }),
  resendEmailVerification: (credentials: Credentials) =>
    apiFetch<void>('/auth/email-verification/resend', credentials, {
      method: 'POST',
    }),
  systemInfo: (credentials: Credentials, signal?: AbortSignal) =>
    apiFetch<ContractSystemInfo>('/system/info', credentials, { signal }).then(
      toSystemInfo,
    ),
  executeThinSliceEcho: (
    credentials: Credentials,
    input: { message: string; idempotencyKey: string },
  ) =>
    apiFetch<ContractThinSliceCommand>('/test/commands/echo', credentials, {
      method: 'POST',
      headers: { 'Idempotency-Key': input.idempotencyKey },
      body: JSON.stringify({ message: input.message }),
    }).then(toThinSliceCommand),
  listSpaces: (credentials: Credentials, signal?: AbortSignal) =>
    apiFetch<ContractSpace[]>('/spaces', credentials, { signal }).then(
      (items) => items.map(toSpace),
    ),
  listWorkspaces: (credentials: Credentials, signal?: AbortSignal) =>
    apiFetch<ContractWorkspace[]>('/workspaces', credentials, { signal }).then(
      (items) => items.map(toWorkspace),
    ),
  listWorkspaceMembers: (
    credentials: Credentials,
    workspaceId: string,
    signal?: AbortSignal,
  ) =>
    apiFetch<ContractWorkspaceMember[]>(
      `/workspaces/${workspaceId}/members`,
      credentials,
      { signal },
    ).then((items) => items.map(toWorkspaceMember)),
  inviteWorkspaceMember: (
    credentials: Credentials,
    workspaceId: string,
    email: string,
  ) =>
    apiFetch<ContractWorkspaceMember>(
      `/workspaces/${workspaceId}/members`,
      credentials,
      { method: 'POST', body: JSON.stringify({ email }) },
    ).then(toWorkspaceMember),
  removeWorkspaceMember: (
    credentials: Credentials,
    workspaceId: string,
    memberId: string,
  ) =>
    apiFetch<void>(
      `/workspaces/${workspaceId}/members/${memberId}`,
      credentials,
      {
        method: 'DELETE',
      },
    ),
  listWorkspaceInvitations: (
    credentials: Credentials,
    workspaceId: string,
    signal?: AbortSignal,
  ) =>
    apiFetch<ContractWorkspaceInvitation[]>(
      `/workspaces/${workspaceId}/invitations`,
      credentials,
      { signal },
    ).then((items) => items.map(toWorkspaceInvitation)),
  createWorkspaceInvitation: (
    credentials: Credentials,
    workspaceId: string,
    email: string,
  ) =>
    apiFetch<ContractWorkspaceInvitation>(
      `/workspaces/${workspaceId}/invitations`,
      credentials,
      { method: 'POST', body: JSON.stringify({ email }) },
    ).then(toWorkspaceInvitation),
  revokeWorkspaceInvitation: (
    credentials: Credentials,
    workspaceId: string,
    invitationId: string,
  ) =>
    apiFetch<void>(
      `/workspaces/${workspaceId}/invitations/${invitationId}`,
      credentials,
      { method: 'DELETE' },
    ),
  acceptWorkspaceInvitation: (credentials: Credentials, verifier: string) =>
    apiFetch<void>('/workspaces/invitations/accept', credentials, {
      method: 'POST',
      body: JSON.stringify({ verifier }),
    }),
  createSpace: (
    credentials: Credentials,
    input: Pick<Space, 'key' | 'name' | 'description'>,
  ) =>
    apiFetch<ContractSpace>('/spaces', credentials, {
      method: 'POST',
      body: JSON.stringify(input),
    }).then(toSpace),
  listPages: (credentials: Credentials, spaceId: string) =>
    apiFetch<ContractPage[]>(`/spaces/${spaceId}/pages`, credentials).then(
      (items) => items.map(toPage),
    ),
  createPage: (
    credentials: Credentials,
    spaceId: string,
    input: Pick<Page, 'title' | 'content'>,
  ) =>
    apiFetch<ContractPage>(`/spaces/${spaceId}/pages`, credentials, {
      method: 'POST',
      body: JSON.stringify(input),
    }).then(toPage),
  updatePage: (
    credentials: Credentials,
    pageId: string,
    input: Pick<Page, 'title' | 'content'>,
  ) =>
    apiFetch<ContractPage>(`/pages/${pageId}`, credentials, {
      method: 'PUT',
      body: JSON.stringify(input),
    }).then(toPage),
  deletePage: (credentials: Credentials, pageId: string) =>
    apiFetch<void>(`/pages/${pageId}`, credentials, { method: 'DELETE' }),
  favoriteStatus: (credentials: Credentials, pageId: string) =>
    apiFetch<{ favorite: boolean }>(`/pages/${pageId}/favorite`, credentials),
  setFavorite: (credentials: Credentials, pageId: string, favorite: boolean) =>
    apiFetch<void>(`/pages/${pageId}/favorite`, credentials, {
      method: favorite ? 'PUT' : 'DELETE',
    }),
  listPageHistory: (credentials: Credentials, pageId: string) =>
    apiFetch<ContractPageVersion[]>(
      `/pages/${pageId}/history`,
      credentials,
    ).then((items) => items.map(toPageVersion)),
  restorePageVersion: (
    credentials: Credentials,
    pageId: string,
    versionId: string,
  ) =>
    apiFetch<ContractPage>(
      `/pages/${pageId}/history/${versionId}/restore`,
      credentials,
      { method: 'POST' },
    ).then(toPage),
  listComments: (credentials: Credentials, pageId: string) =>
    apiFetch<ContractComment[]>(`/pages/${pageId}/comments`, credentials).then(
      (items) => items.map(toComment),
    ),
  createComment: (
    credentials: Credentials,
    pageId: string,
    input: { body: string; parentId?: string },
  ) =>
    apiFetch<ContractComment>(`/pages/${pageId}/comments`, credentials, {
      method: 'POST',
      body: JSON.stringify(input),
    }).then(toComment),
  search: (credentials: Credentials, query: string, signal?: AbortSignal) =>
    apiFetch<ContractPage[]>(
      `/search?q=${encodeURIComponent(query)}`,
      credentials,
      { signal },
    ).then((items) => items.map(toPage)),
  listRepositories: (credentials: Credentials, spaceId: string) =>
    apiFetch<ContractRepository[]>(
      `/spaces/${spaceId}/repositories`,
      credentials,
    ).then((items) => items.map(toRepository)),
  attachRepository: (credentials: Credentials, spaceId: string, url: string) =>
    apiFetch<ContractRepository>(
      `/spaces/${spaceId}/repositories`,
      credentials,
      {
        method: 'POST',
        body: JSON.stringify({ url }),
      },
    ).then(toRepository),
  uploadMedia: (credentials: Credentials, spaceId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiFetch<ContractMedia>(`/spaces/${spaceId}/media`, credentials, {
      method: 'POST',
      body: form,
    }).then(toMedia);
  },
  deleteMedia: (credentials: Credentials, assetId: string) =>
    apiFetch<void>(`/media/${assetId}`, credentials, { method: 'DELETE' }),
};
