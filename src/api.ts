import type { AppState, HolderId, Item } from './types';

export class AuthError extends Error {}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (res.status === 401) throw new AuthError('Not logged in');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const login = (password: string) =>
  req<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) });

export const logout = () => req<{ ok: true }>('/api/logout', { method: 'POST' });

export const getState = () => req<AppState>('/api/state');

export const createItem = (fields: Partial<Item> & { name: string }, actor: string) =>
  req<Item>('/api/items', { method: 'POST', body: JSON.stringify({ ...fields, actor }) });

export const updateItem = (id: string, fields: Partial<Item>, actor: string) =>
  req<Item>(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify({ ...fields, actor }) });

export const moveItem = (id: string, to: HolderId, qty: number, actor: string) =>
  req<{ ok: true }>(`/api/items/${id}/move`, { method: 'POST', body: JSON.stringify({ to, qty, actor }) });

export const deleteItem = (id: string, actor: string) =>
  req<{ ok: true }>(`/api/items/${id}?actor=${encodeURIComponent(actor)}`, { method: 'DELETE' });
