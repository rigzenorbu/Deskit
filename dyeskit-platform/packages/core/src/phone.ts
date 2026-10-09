/**
 * Phone numbers, stored in one form (E.164, e.g. +919876543210) so the same number is always
 * recognised however it was typed: "98765 43210", "+91 98765-43210", "919876543210", "09876543210".
 * A bare 10-digit number is taken as Indian.
 */
export function normalizePhone(input: unknown): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) return `+${digits}`;
  return null;
}

/** +919876543210 → +91 ••••• 43210, for showing where a code was sent. */
export const maskPhone = (e164: string) => `${e164.slice(0, e164.length - 10)} ••••• ${e164.slice(-5)}`;
