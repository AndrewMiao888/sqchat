export function useAppRecovery() {
  const recovery = useState('app-recovery', () => ({ failed: false, reloading: false, path: '', attemptedAt: 0 }))
  const unsent = useState('unsent-message', () => ({ text: '', files: 0 }))
  function retry() {
    if (import.meta.server || recovery.value.reloading) return
    const url = new URL(recovery.value.path || window.location.href, window.location.origin)
    if (url.origin !== window.location.origin) return
    // A short-lived URL marker survives a reload and prevents a broken download looping.
    // Only a timestamp goes in the URL; message text and credentials stay in memory.
    url.searchParams.set('_sq_retry', String(Date.now()))
    recovery.value.reloading = true
    window.location.replace(url.href)
  }
  return { recovery, unsent, retry }
}
