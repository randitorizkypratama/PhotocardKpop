export interface AuthUser {
  id: number
  username: string
  role: string
}

export function useAuth() {
  const user = useState<AuthUser | null>('auth-user', () => null)
  const checked = useState<boolean>('auth-checked', () => false)

  /**
   * Re-read `/api/auth/me`. SSR self-calls carry no `Origin` and no cookie, so
   * the session cookie has to be forwarded explicitly (`opts.headers`) or every
   * server-rendered request would look like a guest. Callers without a session
   * to forward pass nothing and get the client behaviour unchanged.
   */
  async function refresh(opts?: { headers?: Record<string, string> }) {
    try {
      const res = await $fetch<{ user: AuthUser | null }>('/api/auth/me', opts)
      user.value = res.user
    } catch {
      user.value = null
    } finally {
      checked.value = true
    }
  }

  async function login(username: string, password: string) {
    try {
      const res = await $fetch<{ user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      user.value = res.user
      checked.value = true
      return { ok: true as const, message: '' }
    } catch (e) {
      return { ok: false as const, message: extractError(e, 'Login failed') }
    }
  }

  async function register(username: string, password: string) {
    try {
      const res = await $fetch<{ user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: { username, password },
      })
      user.value = res.user
      checked.value = true
      return { ok: true as const, message: '' }
    } catch (e) {
      return { ok: false as const, message: extractError(e, 'Registration failed') }
    }
  }

  async function logout() {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    user.value = null
  }

  /** Ensure auth state is loaded, then return the user (or null). */
  async function ensureChecked(): Promise<AuthUser | null> {
    if (!checked.value) await refresh()
    return user.value
  }

  return { user, checked, refresh, login, register, logout, ensureChecked }
}

function extractError(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'data' in e) {
    const data = (e as { data?: { statusMessage?: string; message?: string } }).data
    return data?.statusMessage || data?.message || fallback
  }
  return e instanceof Error ? e.message : fallback
}
