# K-Pop Photocard Tracker

Track K-pop photocard prices from Pocamarket for IVE, aespa, and Hearts2Hearts.

**Live:** [kpop-tracker-six.vercel.app](https://kpop-tracker-six.vercel.app)

## Features

- Browse 16,200+ photocards; filter by group, member, card type, release, store and price
- Card type normalization (POB, Lucky Draw, MD, Season's Greetings, …) plus smart search parsing
- Price history and trends (IDR primary, USD via Frankfurter with fallback rate)
- Collection binder: wishlist / owned per card
- **Release timeline** (`/releases`) — every Album, EP and Single from MusicBrainz, newest first,
  including releases that have no photocards in the catalog yet
- **Album pages** (`/releases/:group/:release`) — artwork, release date, tracklist, cheapest card,
  card-type and member breakdown, full card grid
- Release enrichment from MusicBrainz + Apple Music (dates, artwork, labels, tracklists)
- Daily auto-sync from Pocamarket at 00:00 WIB, dark mode UI

## How releases are labeled

Pocamarket's API exposes no album field — only the raw card name — so release attribution is
derived in `server/utils/releases/discography.ts`:

1. Each group's full **Album / EP / Single discography** is pulled from MusicBrainz
   (one request per group, cached in the `discography` table, refreshed every 30 days).
   Version siblings are merged into a single entry — `ELEVEN` + `ELEVEN -Japanese ver.-`,
   `Whiplash` + `Whiplash (English version)` — keeping the earliest release date.
2. Every card name is matched against that discography (normalized, word-boundary, longest
   title that starts earliest in the name). Single-word titles must open the name so store
   names like `… SOUND WAVE LUCKY DRAW` never match the `WAVE` release.
3. The token list in `server/utils/pocamarket.ts` remains as a fallback when MusicBrainz is
   unreachable, and sync keeps working with it alone.
4. The timeline and album pages read the **discography first**, so a release shows up even
   when zero photocards exist for it (labeled "No cards yet").
5. Artwork/tracklist/label enrichment resolves on demand and is cached in `release_cache`
   (hit TTL 30 days, negative TTL 7 days; MusicBrainz is limited to 1 request/second).

## Tech Stack

- **Frontend**: Nuxt 4.5 + Vue 3 + Tailwind CSS v3 (reka-ui / shadcn-vue)
- **Database**: Turso (libSQL)
- **Data**: Pocamarket Public API, MusicBrainz, Apple Music/iTunes, Frankfurter FX
- **Icons**: Lucide Vue Next
- **Deploy**: Vercel (with Cron Jobs)
- **Analytics**: Vercel Analytics

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Setup Turso

1. Create account at [turso.tech](https://turso.tech)
2. Create a new database
3. Copy your database URL and auth token

### 3. Environment Variables

Create `.env` file in `apps/kpop-tracker/`:

```env
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your-auth-token
CRON_SECRET=your-cron-secret
```

### 4. Initialize Database

```bash
curl -X POST http://localhost:3000/api/init
```

### 5. Sync Cards

```bash
curl "http://localhost:3000/api/sync/group?group=IVE"
curl "http://localhost:3000/api/sync/group?group=aespa"
curl "http://localhost:3000/api/sync/group?group=Hearts2Hearts"
```

Sync labels each card by matching its name against the MusicBrainz discography for that group
(the discography is fetched and cached automatically on first use).

### 6. Start Development

```bash
bun run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cards` | Browse/search cards (group, member, type, release, store, price) |
| GET | `/api/cards/:id` | Card details + release info |
| GET | `/api/cards/:id/history` | Price history |
| GET | `/api/stores` | Stores with per-group card counts |
| GET | `/api/groups/:group` | Group overview |
| GET | `/api/releases` | Popular releases (homepage section) |
| GET | `/api/releases/timeline` | Full release timeline from the discography |
| GET | `/api/releases/detail` | Album page payload (`?group=&slug=`), works with 0 cards |
| GET | `/api/releases/lookup` | On-demand MusicBrainz/Apple enrichment (`?artist=&title=`) |
| GET | `/api/exchangerate` | USD/IDR rates |
| GET | `/api/collection` | Get collection |
| POST | `/api/collection` | Add to collection |
| DELETE | `/api/collection/:id` | Remove from collection |
| GET | `/api/sync/group` | Sync group to DB |
| POST | `/api/cron/sync` | Daily cron sync (`Authorization: Bearer $CRON_SECRET`) |
| POST | `/api/init` | Initialize database |

## Database

- **cards** — 16,200+ photocards, including the derived `release_name`
- **price_history** — price tracking
- **collections** — user collection (wishlist/owned)
- **discography** — MusicBrainz release list per group (source of truth for releases)
- **release_cache** — cached release enrichment (dates, artwork, tracks, labels)
- **tiktok_auth** / **tiktok_videos** — TikTok Shop integration

## Cron Job

Daily sync at 00:00 WIB (17:00 UTC) via Vercel Cron Jobs. Free on Vercel Hobby plan.
Each run re-labels cards against the (cached) discography and upserts prices.

## Deploy

1. Push to GitHub
2. Import to Vercel
3. Set env vars: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CRON_SECRET`
4. Deploy

## License

MIT
