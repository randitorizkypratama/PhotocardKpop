import { createClient, type Client } from '@libsql/client'

let client: Client | null = null

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
      FOREIGN KEY (card_id) REFERENCES cards(id)
    )
  `)

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

  try {
    await db.execute(`
      DELETE FROM collections
      WHERE id NOT IN (
        SELECT MIN(id) FROM collections GROUP BY card_id, status
      )
    `)
  } catch {}

  try {
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_card_status ON collections(card_id, status)`)
  } catch {}

  console.log('Database initialized successfully')
}
