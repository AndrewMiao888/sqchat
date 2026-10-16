<script setup lang="ts">
import type { ChatState } from '#shared/types/chat'
import type { Conversation } from '#shared/types/auth'
definePageMeta({ middleware: 'auth' })
const { auth, api } = useAuth()
const route = useRoute()
const conversation = computed(() => typeof route.query.chat === 'string' ? route.query.chat : '')
const { data, refresh, pending, error } = await useAsyncData('chat-state', () => api<ChatState>('/api/state', { query: { conversation: conversation.value } }), { default: emptyChatState, watch: [conversation] })
const draft = ref('')
const sending = ref(false)
const sendError = ref('')
const peers = ref<string[]>([])
const chatTitle = ref('')
const showNewChat = ref(false)
const showMembers = ref(false)
const additions = ref<string[]>([])
const starting = ref(false)
const messageList = ref<HTMLElement | null>(null)
const themeStyle = computed(() => chatThemeStyle(data.value.settings))
const { connection } = useChatEvents(() => { void refresh() })
const selectedThread = computed(() => data.value.conversations.find(thread => thread.id === conversation.value))
const switching = computed(() => (data.value.conversation || '') !== conversation.value)
const loadError = computed(() => (error.value as any)?.data?.statusMessage || 'Could not load messages.')
function threadName(thread: Conversation) {
  return thread.title || thread.members.filter(member => member.id !== auth.value.user?.id).map(member => member.name).join(', ') || 'Private conversation'
}
const heading = computed(() => selectedThread.value ? threadName(selectedThread.value) : 'Group conversation')
async function openChat() {
  if (!peers.value.length || starting.value) return
  starting.value = true; sendError.value = ''
  try {
    const result = await api<{ id: string }>('/api/conversations', { method: 'POST', body: { userIds: peers.value, title: chatTitle.value } })
    peers.value = []; chatTitle.value = ''; showNewChat.value = false; await navigateTo({ path: '/', query: { chat: result.id } })
    await refresh()
  } catch (error: any) { sendError.value = error?.data?.statusMessage || 'Could not open that conversation.' }
  finally { starting.value = false }
}
async function addMembers() {
  if (!additions.value.length || starting.value || !conversation.value) return
  starting.value = true; sendError.value = ''
  try {
    await api('/api/conversations/' + conversation.value + '/members', { method: 'POST', body: { userIds: additions.value } })
    additions.value = []; await refresh()
  } catch (error: any) { sendError.value = error?.data?.statusMessage || 'Could not add these people.' }
  finally { starting.value = false }
}
function formatTime(date: string) {
  return new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Adelaide' }).format(new Date(date))
}
function scrollToLatest() { nextTick(() => messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior: 'smooth' })) }
async function sendMessage() {
  if (!draft.value.trim() || sending.value || !data.value.canSend || switching.value) return
  sending.value = true; sendError.value = ''
  const target = conversation.value
  try {
    await api('/api/messages', { method: 'POST', body: { body: draft.value, conversation: target } })
    if (conversation.value === target) draft.value = ''
    await refresh(); scrollToLatest()
  } catch (error: any) { sendError.value = error?.data?.statusMessage || 'Your message could not be sent. Try again.' }
  finally { sending.value = false }
}
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void sendMessage() }
}
onMounted(scrollToLatest)
watch(() => data.value.messages.at(-1)?.id, scrollToLatest)
watch(conversation, () => { draft.value = ''; sendError.value = ''; showMembers.value = false; additions.value = [] })
useHead(() => ({ title: `${data.value.settings.title || 'SQ Chat'} · SQ Chat` }))
</script>
<template>
  <div class="site-shell" :class="[`bubble-${data.settings.bubbleStyle}`, `text-${data.settings.textAnimation}`]" :style="themeStyle">
    <header class="topbar"><BrandLogo /><span class="topbar-caption">A space for your people</span><nav class="topbar-actions"><NuxtLink v-if="auth.user?.role === 'admin'" to="/manage" class="topbar-link"><UiIcon name="settings" /> Settings</NuxtLink><NuxtLink to="/account" class="topbar-link"><UiIcon name="user" /> {{ auth.user?.name }}</NuxtLink></nav></header>
    <main class="chat-layout">
      <aside class="side-panel"><div class="eyebrow"><span class="eyebrow-line"></span> YOUR SPACE</div><h1>{{ data.settings.title }}</h1><p class="side-intro">{{ data.settings.subtitle }}</p><div class="side-divider"></div>
        <div class="section-heading"><span>Conversations</span><span class="section-hint">{{ auth.user?.name }}</span></div>
        <nav class="conversation-list" aria-label="Conversations"><NuxtLink to="/" class="person-button" :class="{ active: !conversation }"><span class="avatar group-avatar"><UiIcon name="users" /></span><span class="person-name">Everyone<span class="conversation-caption">The shared room</span></span><UiIcon name="arrow-up-right" /></NuxtLink>
          <NuxtLink v-for="thread in data.conversations" :key="thread.id" :to="{ path: '/', query: { chat: thread.id } }" class="person-button" :class="{ active: conversation === thread.id }"><span class="avatar" :class="personTone(threadName(thread))">{{ personInitial(threadName(thread)) }}</span><span class="person-name">{{ threadName(thread) }}<span class="conversation-caption">{{ thread.members.some(member => member.id === auth.user?.id) ? 'Private conversation' : 'Administrator view' }}</span></span><UiIcon name="lock" /></NuxtLink>
        </nav>
        <button class="restore-button new-chat-toggle" :aria-expanded="showNewChat" @click="showNewChat = !showNewChat"><UiIcon name="plus" /> New conversation</button>
        <form v-if="showNewChat" class="new-chat-form settings-form" @submit.prevent="openChat"><fieldset class="member-picker"><legend>Choose one or more people</legend><label v-for="member in data.members.filter(member => member.id !== auth.user?.id)" :key="member.id"><input v-model="peers" type="checkbox" :value="member.id"><span class="avatar small-avatar" :class="personTone(member.name)">{{ personInitial(member.name) }}</span>{{ member.name }}</label><p v-if="data.members.length < 2" class="field-help">Other people will appear once Andrew approves them and they set their passwords.</p></fieldset><label v-if="peers.length > 1">Conversation name (optional)<input v-model="chatTitle" maxlength="70" placeholder="e.g. Weekend plans"></label><p class="field-help">Selected people join immediately. No invitation to accept.</p><button class="primary-button" type="submit" :disabled="!peers.length || starting">{{ starting ? 'Opening...' : 'Start chatting' }}<UiIcon name="arrow-right" /></button></form>
        <div class="notice-card"><div class="notice-icon"><SparkIcon /></div><div><strong>Room note</strong><p>{{ data.settings.notice }}</p></div></div>
        <div class="sidebar-foot"><UiIcon name="lock" /> Private chats are visible to their participants and Andrew.</div>
      </aside>
      <section class="chat-panel" :aria-label="heading"><div class="chat-header"><div class="chat-header-main"><span v-if="conversation" class="avatar group-avatar"><UiIcon name="lock" /></span><div v-else class="stacked-avatars" aria-hidden="true"><span v-for="person in data.people.slice(0, 3)" :key="person" class="avatar" :class="personTone(person)">{{ personInitial(person) }}</span></div><div><h2>{{ heading }}</h2><button v-if="selectedThread" class="plain-button members-toggle" :aria-expanded="showMembers" @click="showMembers = !showMembers">{{ selectedThread.members.length }} people / View &amp; add</button><p>{{ conversation ? 'Private · Andrew can also read this chat' : `${data.people.length} active ${data.people.length === 1 ? 'member' : 'members'}` }}</p></div></div><div class="live-badge" :class="{ reconnecting: connection !== 'live' }"><span class="live-dot"></span>{{ connection === 'live' ? 'Live' : 'Connecting...' }}</div></div>
        <div v-if="selectedThread && showMembers" class="thread-members-panel"><div class="member-chips"><span v-for="member in selectedThread.members" :key="member.id"><span class="avatar small-avatar" :class="personTone(member.name)">{{ personInitial(member.name) }}</span>{{ member.name }}{{ member.active ? '' : ' (inactive)' }}</span></div><form v-if="selectedThread.members.some(member => member.id === auth.user?.id)" class="settings-form" @submit.prevent="addMembers"><fieldset class="member-picker compact-picker"><legend>Add people</legend><label v-for="member in data.members.filter(member => !selectedThread!.members.some(existing => existing.id === member.id))" :key="member.id"><input v-model="additions" type="checkbox" :value="member.id">{{ member.name }}</label></fieldset><p class="field-help">People you add join immediately and can read this conversation's history.</p><button class="small-primary" :disabled="!additions.length || starting">Add selected people</button></form></div>
        <div ref="messageList" class="message-list" aria-live="polite" aria-relevant="additions text"><div v-if="error" class="empty-state"><span class="empty-sparkle"><UiIcon name="lock" /></span><p>{{ loadError }}</p><button class="text-button" type="button" @click="refresh()">Try again</button></div><div v-else-if="switching || (pending && !data.messages.length)" class="empty-state"><p>Opening the conversation...</p></div><div v-else-if="!data.messages.length" class="empty-state"><span class="empty-sparkle"><MessageIcon /></span><h3>{{ conversation ? 'Just the start of a conversation.' : data.settings.welcome }}</h3><p>Say hello when you're ready.</p></div><TransitionGroup v-else :name="`message-${data.settings.messageAnimation}`" tag="div" class="message-stack"><div key="conversation-start" class="conversation-start"><span>{{ conversation ? 'Private conversation' : 'Conversation' }}</span></div><article v-for="message in data.messages" :key="message.id" class="message-row" :class="{ 'own-message': message.sender === auth.user?.name }"><span class="avatar message-avatar" :class="personTone(message.sender)">{{ personInitial(message.sender) }}</span><div class="message-content"><div class="message-meta"><strong>{{ message.sender }}</strong><time :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time><span v-if="message.editedAt" class="edited-label">edited</span></div><p class="message-bubble">{{ message.body }}</p></div></article></TransitionGroup></div>
        <form v-if="data.canSend && !switching && !error" class="composer" @submit.prevent="sendMessage"><div class="composer-identity"><span class="identity-selected"><span class="mini-dot" :class="personTone(auth.user?.name || '')"></span>Sending as <strong>{{ auth.user?.name }}</strong></span><span class="composer-tip">Enter to send · Shift + Enter for a new line</span></div><div class="composer-box"><textarea v-model="draft" aria-label="Your message" :placeholder="conversation ? 'Message this conversation...' : 'Message everyone...'" rows="2" maxlength="1000" @keydown="handleKeydown"></textarea><button class="send-button" type="submit" :disabled="sending || !draft.trim()" :aria-label="sending ? 'Sending message' : 'Send message'"><UiIcon name="arrow-up" /></button></div><div class="composer-bottom"><span>Messages arrive live.</span><span>{{ draft.length }}/1000</span></div></form><p v-else-if="conversation && !switching && !error" class="read-only-note"><UiIcon name="lock" /> {{ auth.user?.role === 'admin' ? 'You are reviewing this conversation. Only its active participants can send messages.' : 'One of the participants is currently inactive.' }}</p><p v-if="sendError" class="form-error chat-send-error" role="alert">{{ sendError }}</p>
      </section>
    </main>
  </div>
</template>
