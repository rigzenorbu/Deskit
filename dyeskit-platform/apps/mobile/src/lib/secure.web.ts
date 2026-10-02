/** Web version of secure.ts. Browsers have no keychain; the token lives in localStorage. */
import { kv } from './storage';

export const secure = { get: kv.get, set: kv.set, remove: kv.remove };
