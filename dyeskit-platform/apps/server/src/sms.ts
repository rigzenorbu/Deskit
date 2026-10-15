/**
 * Sending text messages (sign-in codes).
 *
 *   SMS_PROVIDER unset   → nothing is sent; the message is written to the server log. Outside
 *                          production the code is also returned to the app, so phone sign-in can
 *                          be tested without an SMS account. In production, phone sign-in is off.
 *   SMS_PROVIDER=twilio  → TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM (a number) or
 *                          TWILIO_MESSAGING_SERVICE_SID.
 *   SMS_PROVIDER=fast2sms → FAST2SMS_API_KEY (Dev API in the Fast2SMS dashboard). Indian numbers only.
 *                          FAST2SMS_ROUTE=otp (default): Fast2SMS's own fixed "Your OTP is …" text
 *                          (closed by Fast2SMS for accounts without DLT, Oct 2026).
 *                          FAST2SMS_ROUTE=quick: our own text, no DLT needed, but about ₹7 per SMS.
 *                          FAST2SMS_ROUTE=dlt: your DLT-approved template, with FAST2SMS_SENDER_ID
 *                          and FAST2SMS_TEMPLATE_ID (its message id); the code fills its one variable.
 *
 * Other providers (MSG91…) are one more case in sendSms() below. Sending to Indian numbers
 * requires the message template to be registered on TRAI's DLT platform; the provider guides this.
 */

export type SmsMode = 'twilio' | 'fast2sms' | 'log';

export function smsMode(): SmsMode {
  const p = process.env.SMS_PROVIDER;
  return p === 'twilio' || p === 'fast2sms' ? p : 'log';
}

/** Can phone sign-in be offered? Real SMS, or the log outside production (for testing). */
export const phoneSignInAvailable = () => smsMode() !== 'log' || process.env.NODE_ENV !== 'production';

/** In development only: hand the code back to the app, since no SMS is sent. */
export const revealCodes = () => smsMode() === 'log' && process.env.NODE_ENV !== 'production';

/** `code` is the one-time code inside `text`, for providers that send only the code (Fast2SMS). */
export async function sendSms(to: string, text: string, code?: string): Promise<void> {
  if (smsMode() === 'fast2sms') {
    const key = process.env.FAST2SMS_API_KEY;
    if (!key) throw new Error('Fast2SMS is selected but FAST2SMS_API_KEY is missing');
    if (!to.startsWith('+91') || !code) throw Object.assign(new Error('Codes can only be texted to Indian mobile numbers.'), { statusCode: 400 });
    const route = process.env.FAST2SMS_ROUTE;
    const body = route === 'dlt'
      ? { route: 'dlt', sender_id: process.env.FAST2SMS_SENDER_ID, message: process.env.FAST2SMS_TEMPLATE_ID, variables_values: code, numbers: to.slice(3) }
      : route === 'quick'
        ? { route: 'q', message: text, flash: '0', numbers: to.slice(3) }
        : { route: 'otp', variables_values: code, numbers: to.slice(3) };
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => null) as { return?: boolean; message?: unknown } | null;
    if (!res.ok || !out?.return) throw new Error(`SMS could not be sent (${res.status}${out?.message ? `: ${out.message}` : ''})`);
    return;
  }
  if (smsMode() === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('Twilio is selected but TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are missing');
    const body = new URLSearchParams({ To: to, Body: text });
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) body.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
    else body.set('From', process.env.TWILIO_FROM ?? '');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`SMS could not be sent (${res.status})`);
    return;
  }
  console.log(`  [sms → ${to}] ${text}`);
}
