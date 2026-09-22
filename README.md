# K-Pop Photocard Tracker

Track K-pop photocard prices from Pocamarket for IVE, aespa, and Hearts2Hearts.

**Live:** [kpop-tracker-six.vercel.app](https://kpop-tracker-six.vercel.app)

## Features

- Browse 16,000+ photocards by group and member
- Filter by card type, price range, and sort options
- Track price history and trends
- Manage your collection (owned/wishlist)
- Daily auto-sync from Pocamarket at 00:00 WIB
- Modern glassmorphism UI with dark mode support

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

### 6. Start Development

```bash
bun run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cards` | Browse cards from DB |
| GET | `/api/cards/:id` | Get card details |
| GET | `/api/cards/:id/history` | Get price history |
| GET | `/api/collection` | Get collection |
| POST | `/api/collection` | Add to collection |
| DELETE | `/api/collection/:id` | Remove from collection |
| GET | `/api/sync/group` | Sync group to DB |
| POST | `/api/cron/sync` | Daily cron sync |
| POST | `/api/init` | Initialize database |

## Database

- **cards** - 16,200+ photocards
- **price_history** - Price tracking
- **collections** - User collection (wishlist/owned)

## Cron Job

Daily sync at 00:00 WIB (17:00 UTC) via Vercel Cron Jobs. Free on Vercel Hobby plan.

## Deploy

1. Push to GitHub
2. Import to Vercel
3. Set env vars: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CRON_SECRET`
4. Deploy

## License

MIT
