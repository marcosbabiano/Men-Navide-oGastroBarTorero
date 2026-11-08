import { HttpError, parseError } from '../lib/api.ts';
import type { MediaAsset, SiteContent } from '../../shared/schema.ts';
import type { ContentIssue } from '../../shared/completeness.ts';
import type { Design, DesignSummary } from '../../shared/studio.ts';
import type { PartyConfig, ScreenRecord, ScreenStatus, SignageConfig } from '../../shared/signage.ts';

export { HttpError };

export interface DraftDoc {
  content: SiteContent;
  revision: number;
  updatedAt: string;
  updatedBy: string;
}
export interface PublishedMeta {
  revision: number;
  sourceRevision: number;
  publishedAt: string;
  publishedBy: string;
}
export interface AdminState {
  user: { email: string; roles: string[] };
  draft: DraftDoc;
  published: PublishedMeta | null;
  hasUnpublishedChanges: boolean;
  media: MediaAsset[];
  issues: ContentIssue[];
}
export type ScreenView = Omit<ScreenRecord, 'tokenHash'> & { status: ScreenStatus | null };
export interface SignageState {
  config: SignageConfig;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  screens: ScreenView[];
  serverTime: string;
}
export interface CommandBody {
  screenIds: string[] | 'all';
  action: 'playlist' | 'scene' | 'party' | 'auto' | 'pause' | 'resume' | 'next' | 'reload';
  ref?: string;
  party?: PartyConfig | null;
  minutes?: number | null;
}

export interface HistoryEntry {
  key: string;
  revision: number;
  publishedAt: string;
  publishedBy: string;
}

/** Peticiones al API privado: cookie de sesión de Identity + cabecera anti-CSRF. */
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Torero-Admin', '1');
  headers.set('Accept', 'application/json');
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`/api/admin${path}`, { ...init, headers, credentials: 'same-origin' });
  } catch {
    throw new HttpError(0, 'network', 'Sin conexión con el servidor. Comprueba tu conexión a internet.');
  }
  if (!res.ok) {
    const err = await parseError(res);
    if (err.status === 401) window.dispatchEvent(new CustomEvent('torero:unauthorized'));
    throw err;
  }
  return (await res.json()) as T;
}

export const adminApi = {
  session: () => call<{ user: { email: string; roles: string[] } }>('/session'),
  state: () => call<AdminState>('/state'),
  saveDraft: (content: SiteContent, baseRevision: number) =>
    call<{ draft: Omit<DraftDoc, 'content'>; issues: ContentIssue[] }>('/draft', {
      method: 'PUT',
      body: JSON.stringify({ content, baseRevision }),
    }),
  publish: (baseRevision: number) =>
    call<{ published: PublishedMeta; cachePurged: boolean }>('/publish', {
      method: 'POST',
      body: JSON.stringify({ baseRevision }),
    }),
  history: () => call<{ versions: HistoryEntry[] }>('/history'),
  restore: (key: string, baseRevision: number) =>
    call<{ draft: DraftDoc }>('/history/restore', { method: 'POST', body: JSON.stringify({ key, baseRevision }) }),
  upload: (form: FormData) => call<{ asset: MediaAsset }>('/media', { method: 'POST', body: form }),
  patchMedia: (id: string, patch: { alt?: string; folder?: string }) =>
    call<{ asset: MediaAsset }>(`/media/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  designs: () => call<{ designs: DesignSummary[] }>('/designs'),
  design: (id: string) => call<{ design: Design }>(`/designs/${encodeURIComponent(id)}`),
  saveDesign: (design: Design, thumb: string) =>
    call<{ summary: DesignSummary }>(`/designs/${encodeURIComponent(design.id)}`, { method: 'PUT', body: JSON.stringify({ design, thumb }) }),
  deleteDesign: (id: string) => call<{ deleted: string }>(`/designs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  signage: () => call<SignageState>('/signage'),
  saveSignage: (config: SignageConfig, baseRevision: number) =>
    call<{ revision: number; updatedAt: string; updatedBy: string; cachePurged: boolean }>('/signage/config', { method: 'PUT', body: JSON.stringify({ config, baseRevision }) }),
  pairScreen: (code: string, name: string) => call<{ screen: ScreenView }>('/signage/pair', { method: 'POST', body: JSON.stringify({ code, name }) }),
  patchScreen: (id: string, patch: { name?: string; playlistId?: string | null; quality?: string | null }) =>
    call<{ screen: ScreenView }>(`/signage/screens/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  revokeScreen: (id: string) => call<{ deleted: string }>(`/signage/screens/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  command: (body: CommandBody) => call<{ updated: { id: string; version: number }[]; cachePurged: boolean }>('/signage/command', { method: 'POST', body: JSON.stringify(body) }),
  deleteMedia: (id: string) => call<{ deleted: string }>(`/media/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
