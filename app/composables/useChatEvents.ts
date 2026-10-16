export function useChatEvents(onChange: () => void) {
  const connection = ref<'connecting' | 'live' | 'reconnecting'>('connecting')
  let source: EventSource | undefined

  const update = () => {
    connection.value = 'live'
    onChange()
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') onChange()
  }

  onMounted(() => {
    source = new EventSource('/api/events')
    source.addEventListener('ready', update)
    source.addEventListener('change', update)
    source.onerror = () => { connection.value = 'reconnecting' }
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    source?.close()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return { connection }
}
