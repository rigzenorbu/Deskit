/**
 * Sending text messages (sign-in codes).
 *
 *   SMS_PROVIDER unset   → nothing is sent; the message is written to the server log. Outside
 *                          production the code is also returned to the app, so phone sign-in can
 *                          be tested without an SMS account. In production, phone sign-in is off.
 *   SMS_PROVIDER=twilio  → TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM (a number) or
 *                          TWILIO_MESSAGING_SERVICE_SID.
 *
 * Other providers (MSG91, Fast2SMS…) are one more case in send() below. Sending to Indian numbers
 * requires the message template to be registered on TRAI's DLT platform; the provider guides this.
 */

export type SmsMode = 'twilio' | 'log';

export function smsMode(): SmsMode {
  return process.env.SMS_PROVIDER === 'twilio' ? 'twilio' : 'log';
}

/** Can phone sign-in be offered? Real SMS, or the log outside production (for testing). */
export const phoneSignInAvailable = () => smsMode() !== 'log' || process.env.NODE_ENV !== 'production';

/** In development only: hand the code back to the app, since no SMS is sent. */
export const revealCodes = () => smsMode() === 'log' && process.env.NODE_ENV !== 'production';

export async function sendSms(to: string, text: string): Promise<void> {
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
