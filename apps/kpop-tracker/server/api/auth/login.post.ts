export default defineEventHandler(async (event) => {
  requireSameOrigin(event)
  if (!checkAuthAttempt(event)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts, try again later' })
  }

  const body = await readBody(event).catch(() => null)
  const username = String(body?.username ?? '').trim()
  const password = String(body?.password ?? '')

  if (!username || password.length > 128) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid credentials' })
  }

  await ensureAuthTables()
  const db = getTursoClient()

  const result = await db.execute({
    sql: 'SELECT id, username, password_hash FROM users WHERE username = ?',
    args: [username],
  })
  const row = result.rows[0]

  if (!row || !verifyPassword(password, String(row.password_hash))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid username or password' })
  }

  const user = { id: Number(row.id), username: String(row.username) }
  await createSession(event, user)
  return { success: true, user }
})
