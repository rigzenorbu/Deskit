/** Web version of storage.ts: the browser's localStorage. */
const ls = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export const kv = {
  get: async (key: string) => ls()?.getItem(key) ?? null,
  set: async (key: string, value: string) => { ls()?.setItem(key, value); },
  remove: async (key: string) => { ls()?.removeItem(key); },
};

export async function getJson<T>(key: string, fallback: T): Promise<T> {
  try { const v = await kv.get(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export const setJson = (key: string, value: unknown) => kv.set(key, JSON.stringify(value));
