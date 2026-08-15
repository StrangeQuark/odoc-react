import { getRuntimeConfig } from './runtimeConfig';

export type Credentials = {
  username: string;
  password: string;
};

export type Space = {
  id: string;
  key: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
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

async function apiFetch<T>(
  path: string,
  credentials: Credentials,
  init: RequestInit = {},
): Promise<T> {
  const { apiBasePath } = await getRuntimeConfig();
  const headers = new Headers(init.headers);
  headers.set(
    'Authorization',
    `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`,
  );
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiBasePath}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
}

export async function fetchAuthenticatedImage(
  credentials: Credentials,
  path: string,
): Promise<Blob> {
  const { apiBasePath } = await getRuntimeConfig();
  const response = await fetch(`${apiBasePath}${path}`, {
    credentials: 'same-origin',
    headers: {
      Authorization: `Basic ${btoa(`${credentials.username}:${credentials.password}`)}`,
    },
  });
  if (!response.ok)
    throw new Error(`Could not load image (${response.status})`);
  return response.blob();
}

export const odocApi = {
  listSpaces: (credentials: Credentials) =>
    apiFetch<Space[]>('/spaces', credentials),
  createSpace: (
    credentials: Credentials,
    input: Pick<Space, 'key' | 'name' | 'description'>,
  ) =>
    apiFetch<Space>('/spaces', credentials, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listPages: (credentials: Credentials, spaceId: string) =>
    apiFetch<Page[]>(`/spaces/${spaceId}/pages`, credentials),
  createPage: (
    credentials: Credentials,
    spaceId: string,
    input: Pick<Page, 'title' | 'content'>,
  ) =>
    apiFetch<Page>(`/spaces/${spaceId}/pages`, credentials, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updatePage: (
    credentials: Credentials,
    pageId: string,
    input: Pick<Page, 'title' | 'content'>,
  ) =>
    apiFetch<Page>(`/pages/${pageId}`, credentials, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  deletePage: (credentials: Credentials, pageId: string) =>
    apiFetch<void>(`/pages/${pageId}`, credentials, { method: 'DELETE' }),
  favoriteStatus: (credentials: Credentials, pageId: string) =>
    apiFetch<{ favorite: boolean }>(`/pages/${pageId}/favorite`, credentials),
  setFavorite: (credentials: Credentials, pageId: string, favorite: boolean) =>
    apiFetch<void>(`/pages/${pageId}/favorite`, credentials, {
      method: favorite ? 'PUT' : 'DELETE',
    }),
  listPageHistory: (credentials: Credentials, pageId: string) =>
    apiFetch<PageVersion[]>(`/pages/${pageId}/history`, credentials),
  restorePageVersion: (credentials: Credentials, pageId: string, versionId: string) =>
    apiFetch<Page>(`/pages/${pageId}/history/${versionId}/restore`, credentials, { method: 'POST' }),
  listComments: (credentials: Credentials, pageId: string) =>
    apiFetch<PageComment[]>(`/pages/${pageId}/comments`, credentials),
  createComment: (
    credentials: Credentials,
    pageId: string,
    input: { body: string; parentId?: string },
  ) =>
    apiFetch<PageComment>(`/pages/${pageId}/comments`, credentials, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  search: (credentials: Credentials, query: string) =>
    apiFetch<Page[]>(`/search?q=${encodeURIComponent(query)}`, credentials),
  listRepositories: (credentials: Credentials, spaceId: string) =>
    apiFetch<RepositoryBinding[]>(
      `/spaces/${spaceId}/repositories`,
      credentials,
    ),
  attachRepository: (credentials: Credentials, spaceId: string, url: string) =>
    apiFetch<RepositoryBinding>(
      `/spaces/${spaceId}/repositories`,
      credentials,
      {
        method: 'POST',
        body: JSON.stringify({ url }),
      },
    ),
  uploadImage: (credentials: Credentials, spaceId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiFetch<MediaAsset>(`/spaces/${spaceId}/media`, credentials, {
      method: 'POST',
      body: form,
    });
  },
};
