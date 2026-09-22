# K-Pop Photocard Tracker

Track K-pop photocard prices from Pocamarket for IVE, aespa, and Hearts2Hearts.

**Live:** [kpop-tracker.vercel.app](https://kpop-tracker-6ibv051uy-randitorizkypratama-6329s-projects.vercel.app)

## Features

- Browse photocards by group and member
- Filter by card type, price range, and sort options
- Track price history and trends
- Manage your collection (owned/wishlist)
- Daily auto-sync from Pocamarket at 00:00 WIB
- Glassmorphism UI with dark mode support

## Tech Stack

- **Frontend**: Nuxt 4.5 + Vue 3 + Tailwind CSS v3
- **Database**: Turso (libSQL)
- **API**: Pocamarket Public API
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

Create `.env` file in `apps/web/`:

```env
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your-auth-token
CRON_SECRET=your-cron-secret
```

### 4. Initialize Database

```bash
curl -X POST http://localhost:3000/api/init
```

### 5. Sync Cards (Manual)

```bash
# Sync all groups
curl "http://localhost:3000/api/sync/group?group=IVE"
curl "http://localhost:3000/api/sync/group?group=aespa"
curl "http://localhost:3000/api/sync/group?group=Hearts2Hearts"
```

### 6. Start Development

```bash
bun run dev
```

## API Endpoints

- `GET /api/cards?group=IVE&page=1` - Browse cards (from DB)
- `GET /api/cards/:id` - Get card details
- `GET /api/cards/:id/history` - Get price history
- `GET /api/collection` - Get collection
- `POST /api/collection` - Add to collection
- `DELETE /api/collection/:id` - Remove from collection
- `POST /api/cron/sync` - Daily sync (Cron job)
- `GET /api/sync/group?group=IVE` - Manual group sync
- `POST /api/init` - Initialize database

## Database Schema

- **cards** - Photocard data (16,200+ cards)
- **price_history** - Price tracking
- **collections** - User collection (wishlist/owned)

## Cron Job

Daily sync at 00:00 WIB (17:00 UTC) via Vercel Cron Jobs:

- Fetches all cards from Pocamarket
- Updates Turso DB with latest prices and stock
- Free on Vercel Hobby plan

## Deploy to Vercel

1. Push to GitHub
2. Import project to Vercel
3. Set environment variables:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `CRON_SECRET` (generate with `openssl rand -hex 32`)
4. Deploy!

## License

MIT
