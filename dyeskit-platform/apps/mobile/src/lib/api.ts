import { serverUrl } from './config';

let token: string | null = null;
let onUnauthorised: (() => void) | null = null;

export const setToken = (t: string | null) => { token = t; };
export const getToken = () => token;
export const onSessionExpired = (fn: () => void) => { onUnauthorised = fn; };

export class ApiError extends Error {
  constructor(message: string, public status: number, public offline = false) { super(message); }
}

/** Call the DYESKIT server. Throws ApiError with a message that can be shown as-is. */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(serverUrl() + path, {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection — surveys you collect are kept on this phone.', 0, true);
  }
  if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthorised?.();
  if (opts.raw && res.ok) return (await res.text()) as T;
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : { error: await res.text() };
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data as T;
}

/** Turn a filter object into a query string, dropping empty values. */
export const qs = (params: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v !== null && v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
