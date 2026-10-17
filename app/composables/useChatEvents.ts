export function useChatEvents(onChange: (payload?: { conversation?: string | null }) => void) {
  const { auth, load } = useAuth()
  const connection = ref<'connecting' | 'live' | 'reconnecting'>('connecting')
  let source: EventSource | undefined

  const update = (event?: MessageEvent) => {
    connection.value = 'live'
    let payload: { conversation?: string | null } | undefined
    try { payload = event?.data ? JSON.parse(event.data) : undefined } catch {}
    onChange(payload)
    // Account permissions can change while this tab remains open.
    void load().catch(() => {})
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') onChange()
  }

  onMounted(() => {
    source = new EventSource('/api/events')
    source.addEventListener('ready', update)
    source.addEventListener('change', update)
    source.addEventListener('expired', () => {
      source?.close()
      auth.value = { user: null, csrf: '' }
      clearNuxtData()
      void navigateTo('/login')
    })
    source.onerror = () => {
      connection.value = 'reconnecting'
      void load().then(user => { if (!user) { source?.close(); clearNuxtData(); void navigateTo('/login') } }).catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    source?.close()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return { connection }
}
