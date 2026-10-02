/**
 * Small key–value storage on the device.
 * Phones: SQLite (expo-sqlite/kv-store) — survives restarts and has no size limit worth worrying about.
 * Web: the browser's localStorage (see storage.web.ts).
 */
import Storage from 'expo-sqlite/kv-store';

export const kv = {
  get: (key: string): Promise<string | null> => Storage.getItem(key),
  set: (key: string, value: string): Promise<void> => Storage.setItem(key, value),
  remove: (key: string): Promise<void> => Storage.removeItem(key),
};

export async function getJson<T>(key: string, fallback: T): Promise<T> {
  try { const v = await kv.get(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export const setJson = (key: string, value: unknown) => kv.set(key, JSON.stringify(value));
