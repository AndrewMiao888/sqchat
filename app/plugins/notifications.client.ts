export default defineNuxtPlugin(() => {
  const { auth } = useAuth()
  const { sync, enabled } = useDeviceNotifications()
  watch(() => auth.value.user?.id, id => { if (id) void sync(); else enabled.value = false }, { immediate: true })
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'open-chat' && typeof event.data.url === 'string' && /^\/\?(chat=)/.test(event.data.url)) void navigateTo(event.data.url)
    else if (event.data?.type === 'open-chat' && event.data.url === '/') void navigateTo('/')
  })
})
