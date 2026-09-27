import { STRINGS, type Locale } from '@/lib/strings'

/**
 * Minimal EN/ID toggle: one shared locale + a t() lookup with fallback to EN.
 * Persisted in localStorage (restored after mount to avoid hydration mismatch).
 */
export function useLocale() {
  const locale = useState<Locale>('locale', () => 'en')

  function t(key: string, vars?: Record<string, string | number>): string {
    const template = STRINGS[locale.value][key] ?? STRINGS.en[key] ?? key
    if (!vars) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match,
    )
  }

  function setLocale(next: Locale) {
    locale.value = next
    try {
      localStorage.setItem('locale', next)
      document.documentElement.lang = next
    } catch {
      // localStorage unavailable — toggle still works for this session.
    }
  }

  function toggleLocale() {
    setLocale(locale.value === 'en' ? 'id' : 'en')
  }

  onMounted(() => {
    try {
      const saved = localStorage.getItem('locale')
      if (saved === 'en' || saved === 'id') locale.value = saved
      document.documentElement.lang = locale.value
    } catch {
      // Keep the default.
    }
  })

  return { locale, t, setLocale, toggleLocale }
}
