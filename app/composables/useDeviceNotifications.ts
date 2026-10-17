export function useDeviceNotifications() {
  const { api } = useAuth()
  const enabled = useState('push-enabled', () => false)
  const supported = useState('push-supported', () => false)
  const busy = useState('push-busy', () => false)
  const status = useState('push-status', () => '')
  function publicKeyBytes(publicKey: string) {
    const padding = '='.repeat((4 - publicKey.length % 4) % 4)
    const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    return Uint8Array.from([...raw].map(char => char.charCodeAt(0)))
  }
  async function registration() {
    await navigator.serviceWorker.register('/sw.js')
    return navigator.serviceWorker.ready
  }
  async function enable(options: { prompt: boolean; quiet?: boolean } = { prompt: true }) {
    supported.value = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    if (!supported.value) {
      if (!options.quiet) status.value = 'On iPhone or iPad, add SQ Chat to your Home Screen, then open it there to enable notifications.'
      return false
    }
    if (Notification.permission === 'denied') {
      if (!options.quiet) status.value = 'Notifications are blocked. Allow SQ Chat in this device settings, then open the app again.'
      enabled.value = false
      return false
    }
    if (Notification.permission !== 'granted') {
      if (!options.prompt) return false
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        if (!options.quiet) status.value = 'Allow notifications to receive messages when SQ Chat is closed.'
        enabled.value = false
        return false
      }
    }
    const { publicKey } = await api<{ publicKey: string }>('/api/push')
    const reg = await registration()
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKeyBytes(publicKey)
    })
    await api('/api/push', { method: 'POST', body: sub.toJSON() })
    enabled.value = true
    if (!options.quiet) status.value = 'Notifications are enabled on this device.'
    return true
  }
  async function sync() {
    supported.value = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    enabled.value = false
    if (!supported.value) { status.value = 'On iPhone or iPad, add SQ Chat to your Home Screen, then open it there to enable notifications.'; return }
    try {
      const sub = await (await registration()).pushManager.getSubscription()
      if (sub && Notification.permission === 'granted') {
        await api('/api/push', { method: 'POST', body: sub.toJSON() })
        enabled.value = true
      }
      status.value = Notification.permission === 'denied' ? 'Notifications are blocked. Allow them in your browser or device settings, then try again.' : ''
    } catch { status.value = 'Could not connect notifications. Please try again.' }
  }
  async function autoEnable() {
    try {
      if (Notification.permission === 'granted') await enable({ prompt: false, quiet: true })
      else await enable({ prompt: true, quiet: true })
    } catch {
      await sync()
    }
  }
  async function toggle() {
    if (busy.value) return
    busy.value = true; status.value = ''
    try {
      if (enabled.value) {
        await api('/api/push', { method: 'DELETE', body: {} })
        await (await (await registration()).pushManager.getSubscription())?.unsubscribe()
        enabled.value = false
      } else {
        if (!await enable({ prompt: true })) throw new Error(status.value || 'Could not enable notifications. Please try again.')
      }
    } catch (error: any) { status.value = error?.message || 'Could not update notifications. Please try again.' }
    finally { busy.value = false }
  }
  async function test() {
    status.value = 'Sending a test through the push service…'
    try {
      const result = await api<{ sent: boolean; statusCode?: number; message?: string }>('/api/push/test', { method: 'POST', body: {} })
      status.value = result.sent
        ? 'The push service accepted the test. Check this device’s notification centre; delivery can take a moment.'
        : result.message || 'The push test could not be sent.'
    } catch (error: any) { status.value = error?.data?.statusMessage || 'Could not send the push test. Please try again.' }
  }
  return { enabled, supported, busy, status, sync, autoEnable, toggle, test }
}
