import { mobileConfig, validateApiBase } from './config';

export type TokenGetter = () => Promise<string | null>;
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

export function createApiClient(getToken: TokenGetter) {
  return async function apiGet<T>(path: string): Promise<T> {
    if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('Invalid API path');
    const base = validateApiBase(mobileConfig.apiBase);
    const token = await getToken();
    if (!token) throw new ApiError(401, 'AUTH_REQUIRED', 'Please sign in again.');
    const response = await fetch(`${base}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const payload = body as { error?: { code?: string; message?: string } } | null;
      throw new ApiError(response.status, payload?.error?.code ?? 'REQUEST_FAILED',
        response.status >= 500 ? 'Service temporarily unavailable.' : payload?.error?.message ?? 'Request failed.');
    }
    return body as T;
  };
}
