/**
 * Where the server is.
 *
 *   Web (served by the DYESKIT server): the same address the page came from.
 *   Phones: EXPO_PUBLIC_API_URL, baked in at build time (see eas.json), e.g. https://dyeskit.onrender.com
 *   Development: can be changed on the sign-in screen ("Server") — useful on a phone on the same Wi-Fi.
 */
import { Platform } from 'react-native';
import { kv } from './storage';

const BUILT_IN = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
let override: string | null = null;

export async function loadServerOverride() {
  override = (await kv.get('server-url')) || null;
}
export async function setServerUrl(url: string | null) {
  override = url ? url.replace(/\/$/, '') : null;
  if (override) await kv.set('server-url', override); else await kv.remove('server-url');
}
export function serverUrl() {
  if (override) return override;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // the web version always talks to the server it was loaded from (EXPO_PUBLIC_API_URL is for
    // phones); under the Expo dev server (port 8081) that is the API on port 4000
    return window.location.port === '8081' ? `${window.location.protocol}//${window.location.hostname}:4000` : window.location.origin;
  }
  return BUILT_IN || 'http://localhost:4000';
}
