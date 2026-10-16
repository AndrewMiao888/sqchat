<script setup lang="ts">
import { DEFAULT_SETTINGS, PEOPLE, type ChatState, type Person } from '#shared/types/chat'

const emptyState = (): ChatState => ({ messages: [], settings: { ...DEFAULT_SETTINGS } })
const { data, refresh, pending, error } = await useAsyncData('chat-state', () => $fetch<ChatState>('/api/state'), { default: emptyState })
const selected = ref<Person | null>(null)
const draft = ref('')
const sending = ref(false)
const sendError = ref('')
const messageList = ref<HTMLElement | null>(null)
let poller: ReturnType<typeof setInterval> | undefined

const colors: Record<Person, string> = { Andrew: 'andrew', Darius: 'darius', Harrison: 'harrison' }

function selectPerson(person: Person) {
  selected.value = person
  localStorage.setItem('sqchat-person', person)
  sendError.value = ''
}

function formatTime(date: string) {
  return new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Adelaide' }).format(new Date(date))
}

function scrollToLatest() {
  nextTick(() => messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior: 'smooth' }))
}

async function sendMessage() {
  if (!selected.value) {
    sendError.value = 'Choose your name to start chatting.'
    return
  }
  if (!draft.value.trim() || sending.value) return
  sending.value = true
  sendError.value = ''
  try {
    await $fetch('/api/messages', { method: 'POST', body: { sender: selected.value, body: draft.value } })
    draft.value = ''
    await refresh()
    scrollToLatest()
  } catch (error: any) {
    sendError.value = error?.data?.statusMessage || 'Your message could not be sent. Try again.'
  } finally {
    sending.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

onMounted(() => {
  const saved = localStorage.getItem('sqchat-person')
  if (PEOPLE.includes(saved as Person)) selected.value = saved as Person
  scrollToLatest()
  poller = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 2000)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

function onVisibilityChange() {
  if (document.visibilityState === 'visible') refresh()
}

onUnmounted(() => {
  if (poller) clearInterval(poller)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

watch(() => data.value?.messages.at(-1)?.id, (current, previous) => {
  if (current && current !== previous) scrollToLatest()
})

useHead(() => ({ title: `${data.value?.settings.title || 'SQ Chat'} · SQ Chat` }))
</script>

<template>
  <div class="site-shell">
    <header class="topbar">
      <NuxtLink to="/" class="brand" aria-label="SQ Chat home"><span class="brand-mark">sq<span>.</span></span><span>chat</span></NuxtLink>
      <span class="topbar-caption">A space for three</span>
      <NuxtLink to="/manage" class="topbar-link">Manage chat <span aria-hidden="true">↗</span></NuxtLink>
    </header>

    <main class="chat-layout">
      <aside class="side-panel">
        <div class="eyebrow"><span class="eyebrow-line"></span> YOUR SPACE</div>
        <h1>{{ data.settings.title }}</h1>
        <p class="side-intro">{{ data.settings.subtitle }}</p>

        <div class="side-divider"></div>
        <div class="section-heading"><span>Chat as</span><span class="section-hint">Choose one</span></div>
        <div class="people-list" role="group" aria-label="Choose who you are chatting as">
          <button v-for="person in PEOPLE" :key="person" type="button" class="person-button" :class="{ active: selected === person }" :aria-pressed="selected === person" @click="selectPerson(person)">
            <span class="avatar" :class="colors[person]">{{ person.charAt(0) }}</span>
            <span class="person-name">{{ person }}</span>
            <span class="selected-tick" aria-hidden="true">{{ selected === person ? '✓' : '↗' }}</span>
          </button>
        </div>

        <div class="notice-card">
          <div class="notice-icon" aria-hidden="true">✳</div>
          <div><strong>Room note</strong><p>{{ data.settings.notice }}</p></div>
        </div>
        <div class="sidebar-foot">No account needed. Just pick a name and join in.</div>
      </aside>

      <section class="chat-panel" aria-label="Group conversation">
        <div class="chat-header">
          <div class="chat-header-main">
            <div class="stacked-avatars" aria-hidden="true"><span class="avatar andrew">A</span><span class="avatar darius">D</span><span class="avatar harrison">H</span></div>
            <div><h2>Group conversation</h2><p>Andrew, Darius & Harrison</p></div>
          </div>
          <div class="live-badge"><span class="live-dot"></span> Live chat</div>
        </div>

        <div ref="messageList" class="message-list" aria-live="polite" aria-relevant="additions text">
          <div v-if="pending && !data.messages.length" class="empty-state"><span class="empty-sparkle">✳</span><p>Loading the conversation…</p></div>
          <div v-else-if="error" class="empty-state"><span class="empty-sparkle">!</span><p>Could not load messages.</p><button class="text-button" type="button" @click="refresh()">Try again</button></div>
          <div v-else-if="!data.messages.length" class="empty-state"><span class="empty-sparkle">✳</span><h3>{{ data.settings.welcome }}</h3><p>Pick a name and send the first message.</p></div>
          <div v-else class="message-stack">
            <div class="conversation-start"><span>Conversation</span></div>
            <article v-for="message in data.messages" :key="message.id" class="message-row">
              <span class="avatar message-avatar" :class="colors[message.sender]">{{ message.sender.charAt(0) }}</span>
              <div class="message-content"><div class="message-meta"><strong>{{ message.sender }}</strong><time :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time><span v-if="message.editedAt" class="edited-label">edited</span></div><p class="message-bubble">{{ message.body }}</p></div>
            </article>
          </div>
        </div>

        <form class="composer" @submit.prevent="sendMessage">
          <div class="composer-identity"><span v-if="selected" class="identity-selected"><span class="mini-dot" :class="colors[selected]"></span>Sending as <strong>{{ selected }}</strong></span><span v-else>Choose a name on the left to join in</span><span class="composer-tip">Enter to send · Shift + Enter for a new line</span></div>
          <div class="composer-box"><textarea v-model="draft" aria-label="Your message" :placeholder="selected ? `Message as ${selected}…` : 'Choose your name to start chatting…'" rows="2" maxlength="1000" @keydown="handleKeydown"></textarea><button class="send-button" type="submit" :disabled="sending || !draft.trim()" :aria-label="sending ? 'Sending message' : 'Send message'"><span aria-hidden="true">↑</span></button></div>
          <p v-if="sendError" class="form-error" role="alert">{{ sendError }}</p>
          <div class="composer-bottom"><span>Messages update automatically for everyone.</span><span>{{ draft.length }}/1000</span></div>
        </form>
      </section>
    </main>
  </div>
</template>
