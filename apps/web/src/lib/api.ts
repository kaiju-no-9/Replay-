import { useConnectionStore } from '../stores/connection-store';

/**
 * API client: attaches the in-memory bearer token to every request.
 * Token is never written to localStorage — refresh requires re-entry (MVP).
 */
export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useConnectionStore.getState().token;

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  const json = await res.json().catch(() => ({ data: null, error: { code: 'PARSE_ERROR', message: 'Invalid JSON' } }));

  if (!res.ok) {
    const message = json?.error?.message || `Request failed (${res.status})`;
    const error = new Error(message) as Error & { code?: string; details?: unknown };
    error.code = json?.error?.code;
    error.details = json?.error?.details;
    throw error;
  }

  return json.data as T;
}

export function wsUrl(token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/v1?token=${encodeURIComponent(token)}`;
}
