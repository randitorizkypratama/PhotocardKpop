export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const path = event?.path ? String(event.path).split('?')[0] : null
    logError('server', error?.message || 'Unknown error', (error as Error)?.stack, path)
  })
})
