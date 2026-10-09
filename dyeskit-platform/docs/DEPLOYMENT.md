# Putting the server online

The phone apps talk to one server. That server also serves the web version of the app, so
admins and analysts can use it from a computer at the same address.

## What the server needs

- Node.js 22.12+ (24 recommended)
- A PostgreSQL database (version 14 or newer)
- These settings (environment variables):

| Setting | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SEED_DEMO` | `false` in production (no demo accounts or demo surveys) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the first admin account, created on first start when the database has no users |
| `PORT` | set by most hosts automatically |
| `SMS_PROVIDER` | `twilio` to send sign-in codes by text message. Unset: phone sign-in is off in production (in development the code is shown on screen instead) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (or `TWILIO_MESSAGING_SERVICE_SID`) | Twilio account details, when `SMS_PROVIDER=twilio` |
| `OTP_SECRET` | any long random text; keeps sign-in codes valid across a restart |
| `ANTHROPIC_API_KEY` | optional: switches on AI answers in **Ask the data** (Claude, from console.anthropic.com; billed per question). Unset: the assistant gives quick rule-based answers, at no cost |
| `ASSISTANT_MODEL` | optional: the Claude model for Ask the data (default `claude-opus-5-5`) |

**Text messages in India** need the message template registered on TRAI's DLT platform. Your
SMS provider walks you through it; the message the app sends is
"Your DYESKIT sign-in code is 123456. It expires in 10 minutes. Do not share it."
Another provider (MSG91, Fast2SMS…) can be added in `apps/server/src/sms.ts`.

Build and start commands, from the `dyeskit-platform` folder:

```bash
npm ci
npm run build:web     # builds the web version into apps/mobile/dist
npm start             # runs the server; it creates/updates tables and the village list by itself
```

The server checks `/api/health`.

## Option A — Render (simplest)

1. Put the `dyeskit-platform` folder in its own GitHub repository (it is self-contained).
2. On render.com: **New + → Blueprint**, choose the repository. `render.yaml` creates the
   database and the server.
3. In the `dyeskit` service → **Environment**, set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then
   **Manual Deploy → Deploy latest commit**.
4. Open the service address (e.g. `https://dyeskit.onrender.com`) and sign in as that admin.
5. Put that address in `apps/mobile/eas.json` (`EXPO_PUBLIC_API_URL`, preview and production
   profiles) before building the phone apps.

Cost: about US$7/month for the server ("starter") and about US$6/month for the database
("basic-256mb"). The free plans are not suitable: the free server sleeps and the free database
is deleted after 30 days.

## Option B — keeping data in India

India's Digital Personal Data Protection Act 2023 favours keeping household data in the
country. Render has no India region (Singapore is used above). For an India-hosted setup:

- **Database:** Supabase (region *Mumbai, ap-south-1*) or AWS RDS for PostgreSQL in Mumbai.
  Copy the connection string into `DATABASE_URL`.
- **Server:** any Node host in Mumbai — AWS App Runner or Lightsail (ap-south-1), DigitalOcean
  Bangalore, or Railway/Fly.io with an India region where available. Use the build and start
  commands above.

## Backups

Managed PostgreSQL (Render paid plans, Supabase, RDS) takes daily backups automatically. Check
the retention period on your plan, and make a manual export before large changes.
Admins can also download all surveys as CSV from the app (More → Export).

## Updating

Push the new code; the host rebuilds and restarts. On start the server:
1. applies any new database changes (never deletes data),
2. brings the village list in line with `packages/core/src/districts.ts`,
3. recalculates scores if the scoring version changed (raw answers are never altered).
