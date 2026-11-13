import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Booking, BookingRow, ReservasConfig } from '../../../shared/reservas.ts';
import { call, HttpError } from '../api.ts';
import { useToast } from '../ui.tsx';

export interface SyncState {
  provider: string;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  processed: number;
  errors: number;
  lastBatch: number;
}
export interface ModRequest {
  id: string;
  bookingId: string;
  createdAt: string;
  reason: string;
  status: 'pending' | 'done' | 'dismissed';
}
export interface Overview {
  rows: BookingRow[];
  config: ReservasConfig;
  configRevision: number;
  sync: SyncState;
  requests: ModRequest[];
  email: { gmailAvailable: boolean; gmailConnected: boolean; gmailAccount: string; webhookConfigured: boolean; webhookUrl: string };
  serverTime: string;
}

export const rapi = {
  overview: () => call<Overview>('/reservas'),
  booking: (id: string) => call<{ booking: Booking; tokens: { id: string; kind: string; status: string; createdAt: string; createdBy: string; expiresAt: string; usedAt: string | null; allowLate: boolean }[]; candidates: { id: string; score: number; reasons: string[]; contradictions: string[]; booking: { id: string; ref: string; holder: Booking['holder']; createdAt: string; people: number | null; service: string | null } }[] }>(`/reservas/b/${id}`),
  patch: (id: string, body: Record<string, unknown>) => call<{ booking: Booking }>(`/reservas/b/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  action: (id: string, body: Record<string, unknown>) => call<{ booking: Booking }>(`/reservas/b/${id}/action`, { method: 'POST', body: JSON.stringify(body) }),
  link: (id: string, kind: 'modify' | 'complete', allowLate = false) => call<{ link: string; expiresAt: string; kind: string }>(`/reservas/b/${id}/link`, { method: 'POST', body: JSON.stringify({ kind, allowLate }) }),
  revokeLinks: (id: string) => call<{ revoked: number }>(`/reservas/b/${id}/revoke-links`, { method: 'POST', body: '{}' }),
  remove: (id: string) => call<{ deleted: string }>(`/reservas/b/${id}`, { method: 'DELETE' }),
  merge: (emailId: string, targetId: string) => call<{ booking: Booking }>('/reservas/merge', { method: 'POST', body: JSON.stringify({ emailId, targetId }) }),
  manual: (body: Record<string, unknown>) => call<{ booking: Booking }>('/reservas/manual', { method: 'POST', body: JSON.stringify(body) }),
  full: (from: string, to: string) => call<{ bookings: Booking[] }>(`/reservas/full?from=${from}&to=${to}`),
  emails: () => call<{ emails: { key: string; messageId: string; from: string; subject: string; receivedAt: string; via: string; type: string; status: string; result: string; bookingId: string | null; fields: Record<string, string>; missing: string[]; errors: string[] }[] }>('/reservas/emails'),
  ingest: (body: Record<string, unknown>) => call<{ status: string; result: string; bookingId: string | null }>('/reservas/emails/ingest', { method: 'POST', body: JSON.stringify(body) }),
  promote: (key: string) => call<{ booking: Booking }>('/reservas/emails/promote', { method: 'POST', body: JSON.stringify({ key }) }),
  sync: () => call<{ ok: boolean; processed: number; message: string }>('/reservas/sync', { method: 'POST', body: '{}' }),
  gmailAuth: () => call<{ url: string }>('/reservas/gmail/auth-url'),
  gmailDisconnect: () => call<{ ok: boolean }>('/reservas/gmail/disconnect', { method: 'POST', body: '{}' }),
  requests: (body?: Record<string, unknown>) => call<{ requests: ModRequest[] }>('/reservas/requests', body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  saveConfig: (config: ReservasConfig, baseRevision: number) => call<{ revision: number }>('/reservas/config', { method: 'PUT', body: JSON.stringify({ config, baseRevision }) }),
  print: (date: string, service: string, body?: Record<string, unknown>) => call<{ print: { at: string; by: string; kind: string; versions: Record<string, string> } | null }>(`/reservas/prints?date=${date}&service=${service}`, body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  importApply: (items: unknown[]) => call<{ applied: number }>('/reservas/import/apply', { method: 'POST', body: JSON.stringify({ items }) }),
  purge: () => call<{ deleted: number; before: string }>('/reservas/purge', { method: 'POST', body: '{}' }),
};

interface Ctx {
  data: Overview | null;
  error: string | null;
  reload: () => Promise<void>;
  run: <T>(fn: () => Promise<T>, ok?: string) => Promise<T | null>;
}
const C = createContext<Ctx | null>(null);
export const useReservas = () => {
  const c = useContext(C);
  if (!c) throw new Error('ReservasProvider ausente');
  return c;
};

export function ReservasProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await rapi.overview());
      setError(null);
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'No se pudieron cargar las reservas.');
    }
  }, []);
  useEffect(() => {
    void reload();
    const id = window.setInterval(() => {
      if (!document.hidden) void reload();
    }, 30_000);
    return () => clearInterval(id);
  }, [reload]);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | null> => {
      try {
        const r = await fn();
        if (ok) toast.show({ kind: 'success', title: ok });
        void reload();
        return r;
      } catch (e) {
        toast.show({ kind: 'error', title: 'No se pudo completar', text: (e as Error).message });
        return null;
      }
    },
    [reload, toast],
  );
  return <C.Provider value={{ data, error, reload, run }}>{children}</C.Provider>;
}
