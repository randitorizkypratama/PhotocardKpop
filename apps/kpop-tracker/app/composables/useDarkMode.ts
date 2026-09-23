export function useDarkMode() {
  const isDark = useState('dark-mode', () => false)

  function apply(dark: boolean) {
    isDark.value = dark
    const html = document.documentElement
    if (dark) html.classList.add('dark')
    else html.classList.remove('dark')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }

  function init() {
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    apply(saved ? saved === 'dark' : prefersDark)
  }

  function toggle() {
    apply(!isDark.value)
  }

  return { isDark, init, toggle }
}
