export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  if (!checkAuthAttempt(event)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts, try again later' })
  }

  const body = await readBody(event).catch(() => null)
  const username = String(body?.username ?? '').trim()
  const password = String(body?.password ?? '')

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw createError({ statusCode: 400, statusMessage: 'Username must be 3-20 letters, numbers or underscores' })
  }
  if (password.length < 8 || password.length > 128) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be 8-128 characters' })
  }

  await ensureAuthTables()
  const db = getTursoClient()

  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] })
  if (existing.rows.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Username already taken' })
  }

  let userId: number
  try {
    const inserted = await db.execute({
      sql: 'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
      args: [username, hashPassword(password), new Date().toISOString()],
    })
    userId = Number(inserted.lastInsertRowid)
  } catch {
    throw createError({ statusCode: 409, statusMessage: 'Username already taken' })
  }

  // First registered account inherits the pre-login (global) collection rows.
  try {
    await db.execute({ sql: 'UPDATE collections SET user_id = ? WHERE user_id IS NULL', args: [userId] })
  } catch {}

  const user = { id: userId, username }
  await createSession(event, user)
  return { success: true, user }
})
