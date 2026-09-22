# K-Pop Photocard Tracker

Track K-pop photocard prices from Pocamarket for IVE, aespa, and Hearts2Hearts.

## Features

- Browse photocards by group and member
- Track price history and trends
- Manage your collection (owned/wishlist)
- Real-time price updates from Pocamarket API

## Tech Stack

- **Frontend**: Nuxt 3 + Vue 3 + Tailwind CSS
- **Database**: Turso (libSQL)
- **API**: Pocamarket Public API
- **Deploy**: Vercel

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
curl -X POST http://localhost:3000/api/sync
```

### 6. Start Development

```bash
bun run dev
```

## API Endpoints

- `GET /api/cards?group=IVE&page=1` - Browse cards
- `GET /api/cards/:id` - Get card details
- `GET /api/cards/:id/history` - Get price history
- `GET /api/collection` - Get collection
- `POST /api/collection` - Add to collection
- `DELETE /api/collection/:id` - Remove from collection
- `POST /api/sync` - Sync cards from Pocamarket
- `POST /api/init` - Initialize database

## Deploy to Vercel

1. Push to GitHub
2. Import project to Vercel
3. Set environment variables
4. Deploy!

## License

MIT
