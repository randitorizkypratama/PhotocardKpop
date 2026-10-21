import { STRINGS_EN, type Locale } from '@/lib/strings'

/**
 * Minimal EN/ID toggle: one shared locale + a t() lookup with fallback to EN.
 * Persisted in localStorage (restored after mount to avoid hydration mismatch).
 *
 * The Indonesian dictionary (~20 KB of the shared bundle before) is fetched as
 * a separate chunk and only by visitors who actually switch to ID, so the
 * default English UI never downloads it. It is loaded *before* the locale
 * flips, which keeps t() synchronous and avoids a half-translated render.
 */
let idStrings: Record<string, string> | null = null
let idLoad: Promise<void> | null = null

function ensureIdStrings(): Promise<void> {
  if (idStrings) return Promise.resolve()
  if (!idLoad) {
    idLoad = import('@/lib/strings.id')
      .then((module) => {
        idStrings = module.STRINGS_ID
      })
      .catch(() => {
        // Chunk failed (offline fluke): retry on the next switch and fall
        // back to EN keys meanwhile — t() never throws.
        idLoad = null
      })
  }
  return idLoad
}

export function useLocale() {
  const locale = useState<Locale>('locale', () => 'en')

  function t(key: string, vars?: Record<string, string | number>): string {
    const strings = locale.value === 'id' ? (idStrings ?? STRINGS_EN) : STRINGS_EN
    const template = strings[key] ?? STRINGS_EN[key] ?? key
    if (!vars) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match,
    )
  }

  /**
   * Thousands-separated number, pinned to the app's locale.
   *
   * Never call `.toLocaleString()` with no argument: it falls back to the
   * *runtime's* default locale, which is Node's on the server and the visitor's
   * browser on the client. Those differ — Node served "1.061" while an en-US
   * browser expected "1,061" — and Vue reports that as a hydration mismatch on
   * every page that prints a count, for every visitor whose browser locale
   * differs from the server's. Going through `locale` also means ID users see
   * "1.061" *after* the toggle, and the server/client agree because both render
   * the default 'en' during hydration.
   */
  function fmt(value: number): string {
    return value.toLocaleString(locale.value === 'id' ? 'id-ID' : 'en-US')
  }

  async function setLocale(next: Locale) {
    if (next === 'id') await ensureIdStrings()
    locale.value = next
    try {
      localStorage.setItem('locale', next)
      document.documentElement.lang = next
    } catch {
      // localStorage unavailable — toggle still works for this session.
    }
  }

  function toggleLocale() {
    void setLocale(locale.value === 'en' ? 'id' : 'en')
  }

  onMounted(() => {
    try {
      const saved = localStorage.getItem('locale')
      document.documentElement.lang = saved === 'id' ? 'id' : 'en'
      if (saved === 'id' && locale.value !== 'id') {
        // Kick the chunk off during hydration; ID users land on their locale
        // a tick later instead of downloading the dictionary eagerly.
        void ensureIdStrings().then(() => {
          if (locale.value !== 'id') locale.value = 'id'
        })
      }
    } catch {
      // Keep the default.
    }
  })

  return { locale, t, fmt, setLocale, toggleLocale }
}
