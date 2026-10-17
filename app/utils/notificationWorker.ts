// Change the script URL to force installed apps to replace older notification handlers.
export const NOTIFICATION_WORKER = '/sw.js?v=5'
let pending: Promise<ServiceWorkerRegistration> | undefined
export function notificationWorker() {
  if (pending) return pending
  pending = (async () => {
    const registration = await navigator.serviceWorker.register(NOTIFICATION_WORKER, { scope: '/', updateViaCache: 'none' })
    await registration.update()
    const worker = registration.installing || registration.waiting
    if (worker && worker.state !== 'activated') await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('Notification update is still installing. Try again shortly.')) }, 15000)
      function cleanup() { clearTimeout(timer); worker!.removeEventListener('statechange', changed) }
      function changed() {
        if (worker!.state === 'activated') { cleanup(); resolve() }
        else if (worker!.state === 'redundant') { cleanup(); reject(new Error('Notification update failed.')) }
      }
      worker.addEventListener('statechange', changed)
      changed()
    })
    return registration
  })().finally(() => { pending = undefined })
  return pending
}
