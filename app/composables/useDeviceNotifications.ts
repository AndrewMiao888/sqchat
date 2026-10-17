export function useDeviceNotifications() {
  const { api } = useAuth()
  const enabled = useState('push-enabled', () => false)
  const supported = useState('push-supported', () => false)
  const busy = useState('push-busy', () => false)
  const status = useState('push-status', () => '')
  async function registration() {
    await navigator.serviceWorker.register('/sw.js')
    return navigator.serviceWorker.ready
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
  async function toggle() {
    if (busy.value) return
    busy.value = true; status.value = ''
    try {
      if (enabled.value) {
        await api('/api/push', { method: 'DELETE', body: {} })
        await (await (await registration()).pushManager.getSubscription())?.unsubscribe()
        enabled.value = false
      } else {
        // Request directly within the click gesture, before network requests (required on Safari).
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') throw new Error('Allow notifications in your browser or device settings to enable them.')
        const { publicKey } = await api<{ publicKey: string }>('/api/push')
        const reg = await registration()
        const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey })
        await api('/api/push', { method: 'POST', body: sub.toJSON() })
        enabled.value = true
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
  return { enabled, supported, busy, status, sync, toggle, test }
}
