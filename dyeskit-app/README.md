# Project DYESKIT — Village Well-Being Platform

A working end-to-end prototype of the system described in `../DYESKIT_Application_Plan.docx`:
data collection → storage → scoring → dashboards and filtered visualisations → export.

It runs on **Node.js alone** (version 22.5 or newer). There is nothing to install: the database is
Node's built-in SQLite and the front-end is plain ES modules.

```bash
cd dyeskit-app
npm start                # or: node server/server.js
# then open http://localhost:4173
```

The first start creates `data/dyeskit.db` and seeds demo data: 12 Ladakh villages (Leh and Kargil),
670 household surveys with realistic variation, field notes and an audit trail.
`npm run reset` deletes the database and re-seeds it.

## Seeing it as an app on your phone

The server listens on your whole network, so with the Mac and the phone on the same Wi-Fi:

1. `npm start` — it prints an address like `http://192.168.1.10:4173`
2. Open that address in the phone's browser
3. **Install it**: iPhone — Share → *Add to Home Screen*; Android — menu → *Install app*

It then opens full-screen with its own icon, with no browser bar, like any other app. A service
worker caches the interface shell, so the app opens instantly; data always comes from the server
and is never cached.

## Free hosting (for demos only)

`render.yaml` (at the top of the repository) deploys this to Render's free tier: push the repository to GitHub, then on render.com
choose **New + → Blueprint** and point it at the repository.

Free instances sleep after 15 minutes idle (the next visit takes ~30 seconds to wake) and have no
persistent disk, so **the database resets to demo data on every restart**. Good for showing people
the app; not a place for real household data, and the demo passwords below are public in this file.

## Demo accounts

| Role | Email | Password | What they can do |
|---|---|---|---|
| Admin | admin@dyeskit.org | `Admin@123` | Everything: users, villages, delete/restore, exports with identifiers, audit log |
| Supervisor | supervisor@dyeskit.org | `Super@123` | Review and approve, edit any record, exports; cannot delete or manage users |
| Field Researcher | collector@dyeskit.org | `Collect@123` | Collect data in **assigned villages only** (5 of 12); edit own drafts; no export |
| Analyst | analyst@dyeskit.org | `Analyst@123` | Dashboards and **anonymised** exports; no personal details |
| Viewer | viewer@dyeskit.org | `Viewer@123` | Dashboards only, read-only |

A sixth account (`dolma@dyeskit.org`) sits in **“Review in progress”** so you can see the approval
flow on the Administration page. Anyone can self-register from the login screen; new accounts always
arrive as Field Researcher, pending approval.

## What is implemented

**Sign-in and access** — session cookies (HttpOnly), `scrypt` password hashing, five roles enforced
on the server, per-village assignment for field researchers, self-registration with admin approval.

**Data collection** — the full v2 questionnaire (75 items, 9 sections) rendered from one definition
file, with consent recorded before the survey opens, conditional questions, validation ranges,
“prefer not to answer”, progress tracking, draft saving and a **live score preview** while interviewing.

**Storage** — one row per answer, so new questions need no schema change; answer history (nothing is
overwritten); soft deletes into a 30-day recycle bin; an audit log of every login, edit, review,
delete and export; personal details kept in a separate table that analyst exports never touch.

**Scoring** — `server/scoring.js` implements the graduated 0–1 model: 49 indicators → 7 dimensions →
household index → 1–7 band → village index. Missing data rules, validity floors and the minimum
village sample (30% of households or 10) are all applied. Scores are stored with the scoring version
and can be recalculated from raw answers at any time (Administration → Recalculate all scores).

**Dashboards and visualisations** — all respond to the filter bar (district, village, date range,
gender, religion, age range, band, status, search):

- well-being index, coverage and flag tiles
- seven-dimension radar, filtered view vs. all villages
- villages ranked, with the average marked
- households by band (1–7)
- weakest indicators, with severity colouring
- village map coloured by score, clickable to filter
- survey activity and mean score by month
- what villagers ranked as their top priorities
- priority flags and a data-quality panel

Every chart has a hover tooltip and a “Show as table” view, works in light and dark mode, and uses a
colour palette validated for colour-vision deficiency.

**Village profile** — per-village radar against the average, coverage check, indicators to act on,
priorities, and field notes you can add.

**Submissions** — searchable table, full record view with the indicator-by-indicator derivation,
change history, approve / send back, and delete with a reason.

**Insights (rules engine)** — `server/insights.js` turns the Village-Level AI Instructions into code:
28 household-level **signals** (unsafe water, no bank account, income in one season, cut off from care
in winter, …), each counted per village and graded by the share of households affected. It produces
**flags** (below threshold here), **showcases** (notably good here), **matches** (a village with a
problem paired with one without it) and **counts** (how many households, of how many surveyed).
No model, no randomness — the same data always gives the same output.

**Assistant** — `server/assistant.js` answers questions in plain language. Its design rule is that
**the model never produces a number**: it may only choose which of 11 read-only lookups to run, and
then phrase what they returned. Every answer displays the tables it was built from. With
`ANTHROPIC_API_KEY` set it uses Claude (default `claude-opus-5`) to interpret free-form questions;
without a key a keyword planner handles the common ones. Both run the same lookups, so the numbers
are identical either way.

**Export** — one row per household (opens in Excel or SPSS), one row per answer, and a codebook.
Downloads honour the current filters; identifiers are stripped for analysts; every download is logged.

## Turning on the language model

```bash
npm install                        # includes @anthropic-ai/sdk
export ANTHROPIC_API_KEY=sk-ant-…  # from console.anthropic.com
npm start
```

Without a key the app runs normally and the assistant falls back to its keyword planner; the page
says which planner answered. The model sees only village-level aggregates and anonymised notes —
never household records, names or phone numbers.

## Project layout

```
dyeskit-app/
├── server/
│   ├── questionnaire.js   the instrument: sections, items, options, score points
│   ├── scoring.js         indicators, dimensions, index, bands, aggregation
│   ├── db.js              schema, storage helpers, demo seed
│   ├── insights.js        rules engine: signals, flags, showcases, matches
│   ├── assistant.js       question answering; tools + the two planners
│   └── server.js          API, permissions, filters, CSV export
├── public/
│   ├── index.html
│   ├── css/theme.css      wellness theme (light + dark)
│   ├── js/charts.js       SVG charts: radar, bars, line, map
│   ├── js/app.js          views: login, dashboard, villages, survey, insights, data, export, admin
│   └── images/            👉 logo-placeholder.svg — replace with your artwork
└── data/                  SQLite database (created on first run, git-ignored)
```

## Replacing the logo

Put your file at `public/images/logo-placeholder.svg` (same name, any square SVG or PNG — if you use
PNG, update the two `<img src>` references in `public/js/app.js` and the `<link rel="icon">` in
`public/index.html`). Nothing else changes.

## Checking the numbers

```bash
npm run verify
```

Recomputes every published figure a second way — signal counts with SQL straight off the answers
table, dimension and household scores as plain arithmetic — and fails if the two paths disagree.
It ends by printing one household in full, indicator by indicator, so you can check it on paper.
Current state: 6,309 checks, all agreeing.

## Regenerating the scoring methodology document

`../DYESKIT_Scoring_Methodology.docx` (and `.html`, printed to PDF) is generated **from this code**,
so it always matches what the app computes:

```bash
npm install          # installs docx, used only by this tool
npm run docs
```

It lists every indicator, every answer option and the value it carries, the formulas, a worked
example scored live at build time, and the comparison with the original 1 / 0.5 / 0 model.

## Changing questions or scoring

- **Questions** live only in `server/questionnaire.js`. Add an item to a section, give it a type,
  options and (if it should be scored) a `dim` and `pts`. The form, the export columns and the
  codebook all follow automatically.
- **Scoring** lives only in `server/scoring.js`. Indicators list which items they read; rules that
  combine items (BMI, healthcare access, water reliability, counts) are named functions.
- After changing either, run `npm run docs` to refresh the methodology document.
- After changing scoring, run **Administration → Recalculate all scores**: raw answers are re-scored
  and the new scoring version is stamped on each record.

## Before this goes to the field

This prototype is complete in behaviour but deliberately simple in infrastructure. For real
deployment (see Sections 7 and 12 of the plan document):

1. Serve over HTTPS and set the session cookie `Secure`; add rate limiting on `/api/login`.
2. Move to hosted PostgreSQL in an India region; keep nightly backups off-box.
3. Add two-factor authentication for admin and supervisor accounts.
4. Build the offline Android app against this same API (the survey screen here is the reference).
5. Set an API key so the assistant handles free-form questions, and review its answers against the
   evidence tables for a week before letting anyone else use it.
6. Field-test the instrument on 10–15 households, then run the reliability checks before rollout.

Scoring thresholds follow Indian references — ICMR / WHO Asia-Pacific BMI cut-offs, IPHS norms for
hill and tribal areas, BIS IS 10500 drinking water, ₹ income bands — not the Malaysian or Bhutanese
values in the original platform documents.
