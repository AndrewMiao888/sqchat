<script setup lang="ts">
import { DEFAULT_SETTINGS, PEOPLE, type ChatState, type Person } from '#shared/types/chat'

const emptyState = (): ChatState => ({ messages: [], people: [...PEOPLE], settings: { ...DEFAULT_SETTINGS } })
const { data, refresh, pending, error } = await useAsyncData('chat-state', () => $fetch<ChatState>('/api/state'), { default: emptyState })
const selected = ref<Person | null>(null)
const draft = ref('')
const sending = ref(false)
const sendError = ref('')
const newName = ref('')
const addingName = ref(false)
const nameError = ref('')
const messageList = ref<HTMLElement | null>(null)
const themeStyle = computed(() => chatThemeStyle(data.value.settings))
const { connection } = useChatEvents(() => { void refresh() })

function selectPerson(person: Person) {
  selected.value = person
  sendError.value = ''
  nameError.value = ''
}

async function addName() {
  if (!newName.value.trim() || addingName.value) return
  addingName.value = true
  nameError.value = ''
  try {
    const result = await $fetch<{ name: string }>('/api/people', { method: 'POST', body: { name: newName.value } })
    newName.value = ''
    await refresh()
    selectPerson(result.name)
  } catch (error: any) {
    nameError.value = error?.data?.statusMessage || 'Could not add that name. Try again.'
  } finally {
    addingName.value = false
  }
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
  scrollToLatest()
})

watch(() => data.value?.messages.at(-1)?.id, (current, previous) => {
  if (current && current !== previous) scrollToLatest()
})

watch(() => data.value.people, (people) => {
  if (selected.value && !people.includes(selected.value)) {
    selected.value = null
    sendError.value = 'That name was removed. Choose another to keep chatting.'
  }
})

useHead(() => ({ title: `${data.value?.settings.title || 'SQ Chat'} · SQ Chat` }))
</script>

<template>
  <div class="site-shell" :class="[`bubble-${data.settings.bubbleStyle}`, `text-${data.settings.textAnimation}`]" :style="themeStyle">
    <header class="topbar">
      <BrandLogo />
      <span class="topbar-caption">A space for everyone</span>
      <NuxtLink to="/manage" class="topbar-link">Manage chat <UiIcon name="arrow-up-right" /></NuxtLink>
    </header>

    <main class="chat-layout">
      <aside class="side-panel">
        <div class="eyebrow"><span class="eyebrow-line"></span> YOUR SPACE</div>
        <h1>{{ data.settings.title }}</h1>
        <p class="side-intro">{{ data.settings.subtitle }}</p>

        <div class="side-divider"></div>
        <div class="section-heading"><span>Chat as</span><span class="section-hint">Choose or add</span></div>
        <div class="people-list" role="group" aria-label="Choose who you are chatting as">
          <button v-for="person in data.people" :key="person" type="button" class="person-button" :class="{ active: selected === person }" :aria-pressed="selected === person" @click="selectPerson(person)">
            <span class="avatar" :class="personTone(person)">{{ personInitial(person) }}</span>
            <span class="person-name">{{ person }}</span>
            <span class="selected-tick"><UiIcon :name="selected === person ? 'check' : 'arrow-up-right'" /></span>
          </button>
        </div>
        <form class="add-name-form" @submit.prevent="addName">
          <label for="new-person-name">Add your name</label>
          <div class="add-name-row"><input id="new-person-name" v-model="newName" maxlength="24" autocomplete="off" placeholder="Your name" required><button type="submit" :disabled="addingName || !newName.trim()" :aria-label="addingName ? 'Adding name' : 'Add name'"><UiIcon name="plus" /></button></div>
          <p v-if="nameError" class="form-error" role="alert">{{ nameError }}</p>
        </form>

        <div class="notice-card">
          <div class="notice-icon"><SparkIcon /></div>
          <div><strong>Room note</strong><p>{{ data.settings.notice }}</p></div>
        </div>
        <div class="sidebar-foot">No account needed. Just pick a name and join in.</div>
      </aside>

      <section class="chat-panel" aria-label="Group conversation">
        <div class="chat-header">
          <div class="chat-header-main">
            <div class="stacked-avatars" aria-hidden="true"><span v-for="person in data.people.slice(0, 3)" :key="person" class="avatar" :class="personTone(person)">{{ personInitial(person) }}</span><span v-if="data.people.length > 3" class="avatar extra-count">+{{ data.people.length - 3 }}</span></div>
            <div><h2>Group conversation</h2><p>{{ data.people.length }} names in this room</p></div>
          </div>
          <div class="live-badge" :class="{ reconnecting: connection !== 'live' }"><span class="live-dot"></span> {{ connection === 'live' ? 'Live chat' : 'Connecting…' }}</div>
        </div>

        <div ref="messageList" class="message-list" aria-live="polite" aria-relevant="additions text">
          <div v-if="pending && !data.messages.length" class="empty-state"><span class="empty-sparkle"><SparkIcon /></span><p>Loading the conversation…</p></div>
          <div v-else-if="error" class="empty-state"><span class="empty-sparkle">!</span><p>Could not load messages.</p><button class="text-button" type="button" @click="refresh()">Try again</button></div>
          <div v-else-if="!data.messages.length" class="empty-state"><span class="empty-sparkle"><SparkIcon /></span><h3>{{ data.settings.welcome }}</h3><p>Pick a name and send the first message.</p></div>
          <TransitionGroup v-else :name="`message-${data.settings.messageAnimation}`" tag="div" class="message-stack">
            <div key="conversation-start" class="conversation-start"><span>Conversation</span></div>
            <article v-for="message in data.messages" :key="message.id" class="message-row">
              <span class="avatar message-avatar" :class="personTone(message.sender)">{{ personInitial(message.sender) }}</span>
              <div class="message-content"><div class="message-meta"><strong>{{ message.sender }}</strong><time :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time><span v-if="message.editedAt" class="edited-label">edited</span></div><p class="message-bubble">{{ message.body }}</p></div>
            </article>
          </TransitionGroup>
        </div>

        <form class="composer" @submit.prevent="sendMessage">
          <div class="composer-identity"><span v-if="selected" class="identity-selected"><span class="mini-dot" :class="personTone(selected)"></span>Sending as <strong>{{ selected }}</strong></span><span v-else>Choose or add a name to join in</span><span class="composer-tip">Enter to send · Shift + Enter for a new line</span></div>
          <div class="composer-box"><textarea v-model="draft" aria-label="Your message" :placeholder="selected ? `Message as ${selected}…` : 'Choose your name to start chatting…'" rows="2" maxlength="1000" @keydown="handleKeydown"></textarea><button class="send-button" type="submit" :disabled="sending || !draft.trim()" :aria-label="sending ? 'Sending message' : 'Send message'"><UiIcon name="arrow-up" /></button></div>
          <p v-if="sendError" class="form-error" role="alert">{{ sendError }}</p>
          <div class="composer-bottom"><span>Changes arrive live for everyone.</span><span>{{ draft.length }}/1000</span></div>
        </form>
      </section>
    </main>
  </div>
</template>
