# DYESKIT — Village Well-Being Platform for Ladakh

A mobile app (Android and iPhone, plus a web version for computers) and its server, for
collecting household well-being surveys across Ladakh's seven districts and turning them into
clear, checkable insights.

Everything is in this one folder. It does not depend on anything outside it: copy or upload
the folder anywhere and it works.

```
dyeskit-platform/
├── apps/
│   ├── mobile/          the app — React Native + Expo (Android, iOS, web)
│   └── server/          the API — Node.js + Fastify + PostgreSQL
├── packages/
│   └── core/            shared by both: questionnaire, scoring, the 7 districts and
│                        251 villages, insights rules, analytics
├── docs/
│   ├── SCORING.md       every point value, generated from the scoring tables
│   ├── DEPLOYMENT.md    putting the server online
│   └── STORE_RELEASE.md publishing to the Play Store and App Store
└── render.yaml          one-step server deployment on Render
```

## What it does

- **Offline data collection.** Field researchers survey households without signal; surveys save
  on the phone after every answer and upload by themselves when there is a connection.
- **Easy household codes.** Every household gets a code like **`L_CHL_014`** —
  district letter, village code, number. See *Household codes* below.
- **Simple scoring.** Every answer is worth fixed points out of 100; averages give the dimension,
  household and village scores. No formulas. Full explanation: [docs/SCORING.md](docs/SCORING.md),
  and the *How scores work* screen in the app.
- **Dashboards and analysis** that follow the filters (district, village, period, gender, age,
  religion, band): district comparison, trends, distribution of scores, village heatmap, group
  comparisons (gender, age, religion, occupation, education, family, housing, household size),
  weakest questions, development priorities, technology readiness and data quality.
- **Insights** in plain words: priority actions, villages that can learn from each other,
  bright spots — every one a count you can check.
- **Roles**: Admin, Supervisor, Field Researcher, Analyst, Viewer — the same access rules as the
  original platform. New researchers register in the app and wait for an admin's approval.

## Districts and villages

From the Ladakh Gazette notification **S.O. 180 of 27 April 2026**, which created Sham, Nubra,
Changthang, Zanskar and Drass alongside Leh and Kargil:

| District | Letter | HQ | Villages |
|---|---|---|---|
| Leh | L | Leh | 44 |
| Sham | S | Khaltse | 27 |
| Nubra | N | Diskit | 30 |
| Changthang | C | Nyoma | 24 |
| Kargil | K | Kargil | 80 + Sankoo |
| Zanskar | Z | Padum | 26 |
| Drass | D | Drass-Ranbirpura | 19 |

The list lives in `packages/core/src/districts.ts`. Blocks and sub-divisions are kept as they were
(the notification says they continue until notified separately). Where the notification spells a
village differently from the district lists (e.g. "Kanjee" for Kanji), both spellings are stored,
so searching either finds it. The server brings its database in line with this file every time it
starts — editing the file is all it takes to change the list.

## Household codes

```
L_CHL_014     Leh district · Choglamsar (CHL) · household 14
Z_PDM_102     Zanskar district · Padum (PDM) · household 102
K_CHS_003     Kargil district · Choskore in Kargil tehsil (CHS) · household 3
```

Each village has a fixed 3-letter code, unique inside its district (Kargil's two villages called
Choskore are CHS and CHR). The number counts up per village and is given by the server when the
survey uploads — a phone working offline cannot know the next free number. Codes never repeat.

## Run it on your computer

Needs **Node.js 22.12 or newer** (24 recommended).

```bash
cd dyeskit-platform
npm install                 # once
npm run dev:server          # API on http://localhost:4000 (embedded database, demo data)
npm run dev:app             # in a second terminal — then press  w  for the web version
```

Sign in with a demo account (the sign-in screen offers them):
`admin@dyeskit.org / Admin@123`, `supervisor@dyeskit.org / Super@123`,
`collector@dyeskit.org / Collect@123`, `analyst@dyeskit.org / Analyst@123`, `viewer@dyeskit.org / Viewer@123`.

The embedded database lives in `apps/server/data/`. Delete that folder (or run
`npm run reset -w @dyeskit/server`) to start fresh.

### On your own phone

1. Install **Expo Go** from the Play Store / App Store.
2. Phone and computer on the same Wi-Fi. Find the computer's Wi-Fi address (e.g. `192.168.1.8`).
3. `npm run dev:server`, then in `apps/mobile` create `.env` with
   `EXPO_PUBLIC_API_URL=http://192.168.1.8:4000` and run `npm run dev:app`.
4. Scan the QR code with the phone. (The sign-in screen also has a *Server* link to change the
   address.)

## Tests and checks

```bash
npm test            # scoring, districts, codes (core) + API and access rules (server)
npm run typecheck   # TypeScript, all three parts
npm run docs:scoring  # regenerate docs/SCORING.md after changing any points
```

The server tests run on an in-memory database. To run them on a real PostgreSQL:
`TEST_DATABASE_URL=postgres://…/dyeskit_test npm test -w @dyeskit/server` (the database name must
contain "test" — it is wiped).

## Put it online and publish the app

- Server: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Render in one step with `render.yaml`, or any
  Node host with PostgreSQL.
- Play Store and App Store: [docs/STORE_RELEASE.md](docs/STORE_RELEASE.md) — Expo's cloud service
  builds both apps; no Android Studio or Xcode needed.

## Changing things

| To change… | Edit |
|---|---|
| The logo | Replace `apps/mobile/assets/images/logo.png` (1024×1024). For the app icon also replace `icon.png`, `android-icon-foreground.png` (logo on transparent, centred in the middle two-thirds), `android-icon-background.png`, `android-icon-monochrome.png`, `splash-icon.png`, `favicon.png` |
| A question or its points | `packages/core/src/questionnaire.ts`, then `npm test` and `npm run docs:scoring` |
| Villages or districts | `packages/core/src/districts.ts` |
| Warning signs and thresholds | `packages/core/src/insights.ts` |
| Colours and fonts | `apps/mobile/src/theme/index.ts` |
| Roles and permissions | `packages/core/src/roles.ts` |

Old scores are recalculated automatically when the scoring version changes
(`SCORING_VERSION` in `packages/core/src/scoring.ts`); raw answers are never altered.
