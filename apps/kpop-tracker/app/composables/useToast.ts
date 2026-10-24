export interface ToastItem {
  id: number
  message: string
  variant: 'success' | 'error'
}

let seq = 0

/**
 * Minimal transient feedback for actions whose result is otherwise silent —
 * wishlist toggles and collection writes used to fail invisibly when the API
 * was rate-limited or the network dropped. State is global (useState) so a
 * toast raised inside any composable renders in the one <AppToast /> host
 * mounted by app.vue. Auto-dismisses; nothing here is load-bearing, so no
 * queue beyond "keep the newest few" exists.
 */
export function useToast() {
  const toasts = useState<ToastItem[]>('app-toasts', () => [])

  function push(message: string, variant: ToastItem['variant'] = 'success') {
    const id = ++seq
    toasts.value = [...toasts.value, { id, message, variant }].slice(-3)
    if (import.meta.client) {
      window.setTimeout(() => dismiss(id), 3200)
    }
    return id
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(toast => toast.id !== id)
  }

  return { toasts, push, dismiss }
}
