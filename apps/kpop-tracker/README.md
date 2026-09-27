# K-Pop Photocard Tracker - Web App

Nuxt 4.5 web app for browsing and tracking K-pop photocards, with a release timeline
backed by the MusicBrainz discography.

## Quick Start

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

```env
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your-auth-token
CRON_SECRET=your-cron-secret
```

## Build

```bash
bun run build
```

## Test

```bash
bun run test        # unit tests (vitest) for the release-matching logic
bun run smoke       # post-deploy check against production
bun run smoke http://localhost:3000   # or against a local preview
```

The smoke script exits non-zero if the timeline, group API, sync badge, auth
endpoints, or main pages misbehave — run it after every deploy.

## Deploy

Push to `main` (Vercel↔GitHub auto-deploys to production), or deploy manually
from this directory — manual deploys are now the rollback tool:

```bash
npx vercel deploy --prod --yes
```

Release data: cards are labeled from the MusicBrainz discography
(`server/utils/releases/discography.ts`), enriched with Apple Music. The token list in
`server/utils/pocamarket.ts` is only a fallback for when MusicBrainz is down.
Enriched releases show their real album artwork (Apple Music/iTunes) on the
timeline, homepage, and album pages; card images are the fallback.
