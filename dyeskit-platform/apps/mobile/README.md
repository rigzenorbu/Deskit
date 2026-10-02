# DYESKIT app (Android, iOS, web)

React Native with Expo (SDK 57) and Expo Router. See the main README one level up for how to run
everything, and `docs/STORE_RELEASE.md` for publishing.

```
src/
├── app/                 screens (every file is a route)
│   ├── (auth)/          sign in, register
│   └── (app)/           signed-in area
│       ├── (tabs)/      Home, Villages, Collect, Insights, More
│       ├── survey/[id]  the household survey (works offline)
│       ├── village/[id], submission/[id], explore, scoring, export, account
│       └── admin/       users, villages, audit log, recycle bin
├── components/          ui.tsx (building blocks), charts/, scenery.tsx (Ladakh header art), …
├── lib/                 server calls, sign-in, the offline outbox, filters, formatting
└── theme/               colours, fonts, spacing
```

Files ending in `.web.ts` replace their phone versions in the browser (storage, downloads).
