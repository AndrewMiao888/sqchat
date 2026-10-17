// Notification worker v5: request visible, audible alerts and open the related chat.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data.json() } catch {}
  event.waitUntil(self.registration.showNotification(typeof payload.title === 'string' ? payload.title : 'SQ Chat', {
    body: typeof payload.body === 'string' ? payload.body : 'You have a new message.', icon: '/icon-192.png', badge: '/icon-192.png',
    tag: payload.tag || 'sq-message', renotify: true, silent: false, vibrate: [180, 80, 180],
    data: { url: payload.url || '/' }
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || '/', self.location.origin)
    if (target.origin !== self.location.origin || target.pathname !== '/') return
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => client.url === target.href) || windows.find(client => new URL(client.url).origin === target.origin) || windows[0]
    if (existing) {
      if (existing.url !== target.href && existing.navigate) {
        try {
          const navigated = await existing.navigate(target.href)
          await (navigated || existing).focus()
        } catch {
          await self.clients.openWindow(target.href)
        }
      } else {
        existing.postMessage({ type: 'open-chat', url: target.pathname + target.search })
        await existing.focus()
      }
    } else await self.clients.openWindow(target.href)
  })())
})
