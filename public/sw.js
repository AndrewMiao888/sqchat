self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data.json() } catch {}
  event.waitUntil(self.registration.showNotification('SQ Chat', {
    body: 'You have a new message.', icon: '/icon-192.png', badge: '/icon-192.png',
    tag: payload.tag || 'sq-message', data: { url: payload.url || '/' }
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || '/', self.location.origin)
    if (target.origin !== self.location.origin || target.pathname !== '/') return
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows[0]
    if (existing) {
      // Avoid navigating away from a draft; the app's route guard handles the request.
      existing.postMessage({ type: 'open-chat', url: target.pathname + target.search })
      await existing.focus()
    } else await self.clients.openWindow(target.href)
  })())
})
