import type { ApiError } from './contracts';

// Transport only. Domain request/response types belong in CONTRACTS.md.
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json();
  if (!response.ok) {
    const error = body as ApiError;
    throw new Error(error.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}
