import { createClient, type Client } from '@libsql/client'

let client: Client | null = null
let authTablesReady = false

export function getTursoClient(): Client {
  if (!client) {
    const config = useRuntimeConfig()
    client = createClient({
      url: config.tursoDatabaseUrl,
      authToken: config.tursoAuthToken,
    })
  }
  return client
}

// Auth tables (users/sessions) + per-user collections migration. Runs once
// per process so auth works even before /api/init (cron) has run.
export async function ensureAuthTables() {
  if (authTablesReady) return
  const db = getTursoClient()

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      path TEXT,
      created_at TEXT NOT NULL
    )
  `)

  try {
    await db.execute(`ALTER TABLE collections ADD COLUMN user_id INTEGER`)
  } catch {}

  try {
    await db.execute(`DROP INDEX IF EXISTS idx_collections_card_status`)
  } catch {}

  try {
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_user_card_status ON collections(user_id, card_id, status)`)
  } catch {}

  authTablesReady = true
}

export async function initializeDatabase() {
  const db = getTursoClient()
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      image TEXT,
      group_name TEXT NOT NULL,
      member_name TEXT,
      group_image TEXT,
      member_image TEXT,
      card_type TEXT,
      last_price REAL,
      last_discounted_price REAL,
      last_wish_count INTEGER,
      last_sales_volume INTEGER,
      last_stocked_count INTEGER,
      updated_at TEXT
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      price REAL NOT NULL,
      discounted_price REAL,
      wish_count INTEGER,
      sales_volume INTEGER,
      stocked_count INTEGER,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY (card_id) REFERENCES cards(id)
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'wishlist',
      bought_price REAL,
      added_at TEXT NOT NULL,
      user_id INTEGER,
      FOREIGN KEY (card_id) REFERENCES cards(id)
    )
  `)

  try {
    await db.execute(`ALTER TABLE collections ADD COLUMN user_id INTEGER`)
  } catch {}

  await ensureAuthTables()

  try {
    await db.execute(`ALTER TABLE cards ADD COLUMN release_name TEXT`)
  } catch {}

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cards_group ON cards(group_name)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cards_member ON cards(member_name)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(card_type)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cards_release ON cards(release_name)`)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_price_history_card ON price_history(card_id, recorded_at)`)

  try {
    await db.execute(`DROP INDEX IF EXISTS idx_collections_card`)
  } catch {}

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tiktok_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT,
      refresh_token TEXT,
      open_id TEXT,
      expires_at INTEGER,
      refresh_expires_at INTEGER,
      scope TEXT,
      updated_at TEXT
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS release_cache (
      cache_key TEXT PRIMARY KEY,
      artist TEXT,
      title TEXT,
      status TEXT NOT NULL,
      payload TEXT,
      source TEXT,
      fetched_at INTEGER NOT NULL
    )
  `)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_release_cache_fetched ON release_cache(fetched_at)`)

  // MusicBrainz discography per group — the source of truth for the release
  // timeline (see server/utils/releases/discography.ts).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS discography (
      group_name TEXT NOT NULL,
      release_key TEXT NOT NULL,
      title TEXT NOT NULL,
      release_type TEXT,
      release_date TEXT,
      mbid TEXT,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (group_name, release_key)
    )
  `)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_discography_group ON discography(group_name)`)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tiktok_videos (
      id TEXT PRIMARY KEY,
      title TEXT,
      video_description TEXT,
      duration INTEGER,
      cover_image_url TEXT,
      share_url TEXT,
      embed_link TEXT,
      create_time INTEGER,
      like_count INTEGER,
      comment_count INTEGER,
      share_count INTEGER,
      view_count INTEGER,
      fetched_at TEXT
    )
  `)

  console.log('Database initialized successfully')
}
