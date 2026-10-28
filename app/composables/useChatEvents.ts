import type { Ref } from 'vue'

type ChatChange = { conversation?: string | null; receipt?: boolean; reaction?: boolean; appearance?: boolean }
type PresenceChange = { conversation?: string | null; online?: boolean }
type Listener = { onChange: (payload?: ChatChange) => void; onPresence?: (payload?: PresenceChange) => void }

// One stream per tab: each open stream holds a server function, so components share it.
const listeners = new Set<Listener>()
let source: EventSource | undefined
let reminderTimer: ReturnType<typeof setInterval> | undefined
let authStale = false
let shared: { connection: Ref<'connecting' | 'live' | 'reconnecting'>; auth: ReturnType<typeof useAuth>['auth']; api: ReturnType<typeof useAuth>['api']; load: ReturnType<typeof useAuth>['load'] } | undefined

const visible = () => document.visibilityState === 'visible'
const checkReminders = () => { void shared?.api('/api/reminders/check', { method: 'POST', body: {} }).catch(() => {}) }
// Hidden tabs cannot show presence or account changes; becoming visible refreshes both.
const presence = (payload?: PresenceChange) => { if (visible()) listeners.forEach(listener => listener.onPresence?.(payload)) }
const reloadAuth = () => {
  if (!visible()) { authStale = true; return }
  authStale = false
  void shared?.load().catch(() => {})
}

function update(event?: MessageEvent) {
  shared!.connection.value = 'live'
  let payload: ChatChange | undefined
  try { payload = event?.data ? JSON.parse(event.data) : undefined } catch {}
  listeners.forEach(listener => listener.onChange(payload))
  if (!payload?.receipt) presence()
  // Account permissions can change while this tab remains open.
  if (!payload?.receipt) reloadAuth()
}

function onVisibilityChange() {
  if (!visible()) return
  listeners.forEach(listener => { listener.onChange(); listener.onPresence?.() })
  checkReminders()
  if (authStale) reloadAuth()
}

function open() {
  const { connection, auth, load } = shared!
  connection.value = 'connecting'
  source = new EventSource('/api/events')
  source.addEventListener('ready', update)
  source.addEventListener('change', update)
  source.addEventListener('presence', event => {
    let payload: PresenceChange | undefined
    try { payload = JSON.parse((event as MessageEvent).data) } catch {}
    presence(payload)
  })
  source.addEventListener('heartbeat', () => presence())
  source.addEventListener('expired', () => {
    close()
    auth.value = { user: null, csrf: '' }
    clearNuxtData()
    void navigateTo('/login')
  })
  source.onerror = () => {
    connection.value = 'reconnecting'
    void load().then(user => { if (!user) { close(); clearNuxtData(); void navigateTo('/login') } }).catch(() => {})
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  checkReminders()
  reminderTimer = setInterval(() => { if (visible()) checkReminders() }, 5 * 60 * 1000)
}

function close() {
  source?.close()
  source = undefined
  if (reminderTimer) clearInterval(reminderTimer)
  reminderTimer = undefined
  document.removeEventListener('visibilitychange', onVisibilityChange)
}

export function useChatEvents(onChange: (payload?: ChatChange) => void, onPresence?: (payload?: PresenceChange) => void) {
  const { auth, api, load } = useAuth()
  // Server renders get their own state; only the browser shares one stream.
  if (import.meta.server) return { connection: ref<'connecting' | 'live' | 'reconnecting'>('connecting') }
  shared ||= { connection: ref('connecting'), auth, api, load }
  const listener: Listener = { onChange, onPresence }

  onMounted(() => {
    listeners.add(listener)
    if (!source) open()
    // A stream that is already live sent its ready event before this component joined.
    else if (shared!.connection.value === 'live') {
      onChange()
      if (visible()) onPresence?.()
      reloadAuth()
      checkReminders()
    }
  })

  onUnmounted(() => {
    listeners.delete(listener)
    if (!listeners.size) close()
  })

  return { connection: shared.connection }
}
