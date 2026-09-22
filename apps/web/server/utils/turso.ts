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

  console.log('Database initialized successfully')
}
