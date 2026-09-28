export default defineNuxtPlugin(() => {
  const report = (message: string, stack?: string) => {
    if (!import.meta.client) return
    $fetch('/api/errors', {
      method: 'POST',
      body: {
        message: message.slice(0, 500),
        stack: stack?.slice(0, 4000),
        path: window.location.pathname,
      },
    }).catch(() => {})
  }

  if (import.meta.client) {
    window.addEventListener('error', (e) => {
      report(e.message, e.error instanceof Error ? e.error.stack : undefined)
    })
    window.addEventListener('unhandledrejection', (e) => {
      const reason = e.reason as { message?: string; stack?: string } | undefined
      report(reason?.message ? String(reason.message) : 'Unhandled rejection', reason?.stack)
    })
  }
})
