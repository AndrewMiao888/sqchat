import { notificationWorker } from '~/utils/notificationWorker'

export default defineNuxtPlugin(() => {
  if ('serviceWorker' in navigator) void notificationWorker().catch(() => {})
  const { auth } = useAuth()
  const { autoEnable, sync, enabled } = useDeviceNotifications()
  watch(() => auth.value.user?.id, id => { if (id) void autoEnable(); else enabled.value = false }, { immediate: true })
  document.addEventListener('visibilitychange', () => { if (!document.hidden && auth.value.user?.id) void sync() })
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'open-chat' && typeof event.data.url === 'string' && /^\/\?(chat=)/.test(event.data.url)) void navigateTo(event.data.url)
    else if (event.data?.type === 'open-chat' && event.data.url === '/') void navigateTo('/')
  })
})
