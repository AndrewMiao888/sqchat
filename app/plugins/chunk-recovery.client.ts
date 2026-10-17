export default defineNuxtPlugin(nuxtApp => {
  const { recovery, unsent, retry } = useAppRecovery()
  const router = useRouter()
  const url = new URL(window.location.href)
  const marker = Number(url.searchParams.get('_sq_retry'))
  recovery.value.attemptedAt = Number.isFinite(marker) ? marker : 0
  const chunkErrors = new Set<unknown>()
  let timer: ReturnType<typeof setTimeout> | undefined
  function isChunkError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return chunkErrors.has(error) || /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading (?:CSS )?chunk .* failed|Unable to preload CSS/i.test(message)
  }
  function recover(path = window.location.pathname + window.location.search + window.location.hash) {
    recovery.value.failed = true
    recovery.value.path = path
    clearTimeout(timer)
    timer = setTimeout(() => {
      // Keep an unsent message available on the recovery screen. Never discard it silently.
      if (!unsent.value.text && !unsent.value.files && navigator.onLine && Date.now() - recovery.value.attemptedAt > 120000) retry()
      else if (!nuxtApp.payload.error) nuxtApp.runWithContext(() => showError({ statusCode: 503, statusMessage: 'Unable to load SQ Chat' }))
    }, 0)
  }
  nuxtApp.hook('app:chunkError', ({ error }) => {
    chunkErrors.add(error)
    if (nuxtApp.isHydrating) recover()
  })
  router.onError((error, to) => { if (isChunkError(error)) recover(to.fullPath) })
  nuxtApp.hook('app:error', error => { if (isChunkError(error)) recover(recovery.value.path || undefined) })
  nuxtApp.hook('app:mounted', () => {
    if (!nuxtApp.payload.error && !recovery.value.failed && url.searchParams.has('_sq_retry')) {
      url.searchParams.delete('_sq_retry')
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    }
  })
})
