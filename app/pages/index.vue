<script setup lang="ts">
import type { ChatState } from '#shared/types/chat'
import type { ChatMessage } from '#shared/types/chat'
import type { ScreenEffect } from '#shared/types/media'
import type { Conversation } from '#shared/types/auth'
definePageMeta({ middleware: 'auth' })
const { auth, api } = useAuth()
const route = useRoute()
const conversation = computed(() => typeof route.query.chat === 'string' ? route.query.chat : '')
const { data, refresh, pending, error } = await useAsyncData('chat-state', () => api<ChatState>('/api/state', { query: { conversation: conversation.value } }), { default: emptyChatState, watch: [conversation] })
const history = ref<{ cursor: string; data: ChatState }[]>([])
const historyLoading = ref(false)
const messages = computed(() => [...new Map([...history.value].reverse().flatMap(page => page.data.messages).concat(data.value.messages).map(message => [message.id, message])).values()])
const historyEnd = computed(() => history.value.at(-1)?.data || data.value)
const sendError = ref('')
const replyingTo = ref<ChatMessage | null>(null)
function jumpToMessage(id: string) {
  const target = document.getElementById('message-' + id)
  if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.focus({ preventScroll: true }) }
  else sendError.value = 'Use Load older messages at the top of the chat to find the original. Its quote is shown in this reply.'
}
const peers = ref<string[]>([])
const includeSelf = ref(true)
const chatTitle = ref('')
const showNewChat = ref(false)
const mobileConversations = ref(false)
const showMembers = ref(false)
const additions = ref<string[]>([])
const starting = ref(false)
const messageList = ref<HTMLElement | null>(null)
useHead(() => ({ link: [{ rel: 'icon', type: 'image/svg+xml', key: 'favicon', href: '/favicon.svg?accent=' + encodeURIComponent(data.value.settings.accentColor) }] }))
const themeStyle = computed(() => chatThemeStyle(data.value.settings))
const unreadConversations = ref<Record<string, boolean>>({})
function conversationKey(value: string | null | undefined = conversation.value) { return value || 'shared' }
function hasUnread(value: string | null | undefined) { return !!unreadConversations.value[conversationKey(value)] }
function clearUnread(value: string | null | undefined = conversation.value) {
  const key = conversationKey(value)
  if (unreadConversations.value[key]) unreadConversations.value = { ...unreadConversations.value, [key]: false }
}
const { connection } = useChatEvents(payload => {
  if (payload && 'conversation' in payload && conversationKey(payload.conversation) !== conversationKey()) {
    unreadConversations.value = { ...unreadConversations.value, [conversationKey(payload.conversation)]: true }
  }
  void refreshLive().catch(() => {})
})
async function refreshLive() {
  const target = conversation.value
  await refresh()
  const updated = await Promise.all(history.value.map(async page => ({ cursor: page.cursor, data: await api<ChatState>('/api/state', { query: { conversation: target, before: page.cursor } }) })))
  if (target === conversation.value) history.value = updated
}
async function loadOlder() {
  const cursor = historyEnd.value.nextCursor
  if (!cursor || historyLoading.value) return
  const target = conversation.value, height = messageList.value?.scrollHeight || 0, top = messageList.value?.scrollTop || 0
  historyLoading.value = true
  try {
    const older = await api<ChatState>('/api/state', { query: { conversation: target, before: cursor } })
    if (target === conversation.value) { history.value.push({ cursor, data: older }); await nextTick(); if (messageList.value) messageList.value.scrollTop = top + messageList.value.scrollHeight - height }
  } catch (error: any) { sendError.value = error?.data?.statusMessage || 'Could not load older messages.' }
  finally { historyLoading.value = false }
}
const selectedThread = computed(() => data.value.conversations.find(thread => thread.id === conversation.value))
const switching = computed(() => (data.value.conversation || '') !== conversation.value)
const loadError = computed(() => (error.value as any)?.data?.statusMessage || 'Could not load messages.')
function threadName(thread: Conversation) {
  return thread.title || thread.members.filter(member => member.id !== auth.value.user?.id).map(member => member.name).join(', ') || 'Private conversation'
}
const heading = computed(() => selectedThread.value ? threadName(selectedThread.value) : auth.value.user?.privateOnly ? 'Your private chats' : 'Group conversation')
const effectsEnabled = useState('effects-enabled', () => true)
const soundEnabled = useState('effects-sound', () => false)
const replay = ref<Record<string, number>>({})
const screen = ref<{ effect?: ScreenEffect; text: string; play: number }>({ text: '', play: 0 })
const editingMessage = ref<ChatMessage | null>(null)
const editingBody = ref('')
const savingEdit = ref(false)
function playScreen(effect: ScreenEffect, text: string) { if (effectsEnabled.value) screen.value = { effect, text, play: screen.value.play + 1 } }
function replayMessage(message: ChatMessage) { replay.value[message.id] = (replay.value[message.id] || 0) + 1; if (message.effects?.screen && message.effects.bubble !== 'invisible') playScreen(message.effects.screen, message.body) }
let seenConversation = conversation.value
let seenMessages = new Set(data.value.messages.map(message => message.id))
watch(() => data.value.messages, messages => {
  if (switching.value) return
  if (seenConversation !== conversation.value) { seenConversation = conversation.value; seenMessages = new Set(messages.map(message => message.id)); return }
  const latest = messages.filter(message => !seenMessages.has(message.id)).at(-1)
  seenMessages = new Set(messages.map(message => message.id))
  if (latest?.effects?.screen && latest.effects.bubble !== 'invisible' && document.visibilityState === 'visible') playScreen(latest.effects.screen, latest.body)
})
async function messageSent() { replyingTo.value = null; await refresh(); scrollToLatest() }
function startEditing(message: ChatMessage) {
  editingMessage.value = message
  editingBody.value = message.body
  sendError.value = ''
}
async function saveEdit() {
  const message = editingMessage.value
  if (!message || savingEdit.value || !editingBody.value.trim()) return
  savingEdit.value = true; sendError.value = ''
  try {
    await api('/api/messages/' + message.id, { method: 'PATCH', body: { body: editingBody.value } })
    editingMessage.value = null
    editingBody.value = ''
    await refreshLive()
  } catch (error: any) { sendError.value = error?.data?.statusMessage || 'Could not edit this message.' }
  finally { savingEdit.value = false }
}
const deletingMessage = ref('')
async function removeMessage(message: ChatMessage) {
  if (deletingMessage.value || !window.confirm('Delete this message and its attachments for everyone? This cannot be undone.')) return
  deletingMessage.value = message.id; sendError.value = ''
  try {
    await api('/api/messages/' + message.id, { method: 'DELETE', body: {} })
    if (replyingTo.value?.id === message.id) replyingTo.value = null
    await refreshLive()
  } catch (error: any) { sendError.value = error?.data?.statusMessage || 'Could not delete this message.' }
  finally { deletingMessage.value = '' }
}
async function deleteConversation() {
  if (!window.confirm('Delete this conversation and all its messages and files for everyone?')) return
  try { await api('/api/conversations/' + conversation.value, { method: 'DELETE', body: {} }); await navigateTo('/'); await refresh() }
  catch (error: any) { sendError.value = error?.data?.statusMessage || 'Could not delete this conversation.' }
}
async function openChat() {
  if (peers.value.length < (includeSelf.value ? 1 : 2) || starting.value) return
  starting.value = true; sendError.value = ''
  try {
    const result = await api<{ id: string }>('/api/conversations', { method: 'POST', body: { userIds: peers.value, title: chatTitle.value, includeSelf: includeSelf.value } })
    peers.value = []; chatTitle.value = ''; showNewChat.value = false; await navigateTo({ path: '/', query: { chat: result.id } })
    await refresh()
  } catch (error: any) { sendError.value = error?.data?.statusMessage || 'Could not open that conversation.' }
  finally { starting.value = false }
}
async function removeMember(id: string, name: string) {
  if (!window.confirm('Remove ' + name + ' from this conversation? All messages will remain.')) return
  try { await api('/api/conversations/' + conversation.value + '/members/' + id, { method: 'DELETE', body: {} }); await refresh() }
  catch (error: any) { sendError.value = error?.data?.statusMessage || 'Could not remove this person.' }
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
onMounted(scrollToLatest)
watch(() => data.value.messages.at(-1)?.id, scrollToLatest)
watch(conversation, () => { history.value = []; replyingTo.value = null; editingMessage.value = null; editingBody.value = ''; mobileConversations.value = false; sendError.value = ''; showMembers.value = false; additions.value = []; clearUnread() })
useHead(() => ({ title: `${data.value.settings.title || 'SQ Chat'} · SQ Chat` }))
</script>
<template>
  <div class="site-shell" :class="[`bubble-${data.settings.bubbleStyle}`, `text-${data.settings.textAnimation}`]" :style="themeStyle">
    <header class="topbar"><BrandLogo /><span class="topbar-caption">A space for your people</span><nav class="topbar-actions"><NuxtLink to="/account#notifications" class="topbar-link" aria-label="Device notifications" title="Device notifications"><UiIcon name="bell" /></NuxtLink><NuxtLink v-if="auth.user?.role === 'admin'" to="/manage" class="topbar-link"><UiIcon name="settings" /> Settings</NuxtLink><NuxtLink to="/account" class="topbar-link"><UiIcon name="user" /> {{ auth.user?.name }}</NuxtLink></nav></header>
    <main class="chat-layout">
      <aside class="side-panel" :class="{ 'mobile-open': mobileConversations }"><button class="mobile-conversations-toggle" :aria-expanded="mobileConversations" @click="mobileConversations = !mobileConversations"><UiIcon name="users" /><strong>Conversations</strong><UiIcon :name="mobileConversations ? 'close' : 'arrow-right'" /></button><div class="eyebrow"><span class="eyebrow-line"></span> YOUR SPACE</div><h1>{{ data.settings.title }}</h1><p class="side-intro">{{ data.settings.subtitle }}</p><div class="side-divider"></div>
        <div class="section-heading"><span>Conversations</span><span class="section-hint">{{ auth.user?.name }}</span></div>
        <nav class="conversation-list" aria-label="Conversations"><NuxtLink v-if="!auth.user?.privateOnly" to="/" class="person-button" :class="{ active: !conversation, unread: hasUnread(null) }"><span class="avatar group-avatar"><UiIcon name="users" /></span><span class="person-name">Everyone<span class="conversation-caption">The shared room</span></span><span v-if="hasUnread(null)" class="unread-dot" aria-label="New message"></span><UiIcon name="arrow-up-right" /></NuxtLink>
          <NuxtLink v-for="thread in data.conversations" :key="thread.id" :to="{ path: '/', query: { chat: thread.id } }" class="person-button" :class="{ active: conversation === thread.id, unread: hasUnread(thread.id) }"><span class="avatar" :class="personTone(threadName(thread))">{{ personInitial(threadName(thread)) }}</span><span class="person-name">{{ threadName(thread) }}<span class="conversation-caption">{{ thread.members.some(member => member.id === auth.user?.id) ? 'Private conversation' : 'Administrator view' }}</span></span><span v-if="hasUnread(thread.id)" class="unread-dot" aria-label="New message"></span><UiIcon name="lock" /></NuxtLink>
        </nav>
        <button class="restore-button new-chat-toggle" :aria-expanded="showNewChat" @click="showNewChat = !showNewChat"><UiIcon name="plus" /> New conversation</button>
        <form v-if="showNewChat" class="new-chat-form settings-form" @submit.prevent="openChat"><fieldset class="member-picker"><legend>Choose one or more people</legend><label v-for="member in data.members.filter(member => member.id !== auth.user?.id)" :key="member.id"><input v-model="peers" type="checkbox" :value="member.id"><span class="avatar small-avatar" :class="personTone(member.name)">{{ personInitial(member.name) }}</span>{{ member.name }}</label><p v-if="data.members.length < 2" class="field-help">Other people will appear once Andrew approves them and they set their passwords.</p></fieldset><label v-if="peers.length > 1">Conversation name (optional)<input v-model="chatTitle" maxlength="70" placeholder="e.g. Weekend plans"></label><label v-if="auth.user?.role === 'admin'" class="include-self"><input v-model="includeSelf" type="checkbox"> Include me in this conversation</label><p v-if="!includeSelf" class="field-help">Choose at least two people. You can read and manage this chat without joining.</p><p class="field-help">Selected people join immediately. No invitation to accept.</p><button class="primary-button" type="submit" :disabled="peers.length < (includeSelf ? 1 : 2) || starting">{{ starting ? 'Opening...' : 'Start chatting' }}<UiIcon name="arrow-right" /></button></form>
        <div v-if="!auth.user?.privateOnly" class="notice-card"><div class="notice-icon"><SparkIcon /></div><div><strong>Room note</strong><p>{{ data.settings.notice }}</p></div></div>
        <div class="sidebar-foot"><UiIcon name="lock" /> Private chats are visible to their participants and Andrew.</div>
      </aside>
      <section class="chat-panel" :aria-label="heading"><div class="chat-header"><div class="chat-header-main"><span v-if="conversation" class="avatar group-avatar"><UiIcon name="lock" /></span><div v-else class="stacked-avatars" aria-hidden="true"><span v-for="person in data.people.slice(0, 3)" :key="person" class="avatar" :class="personTone(person)">{{ personInitial(person) }}</span></div><div><h2>{{ heading }}</h2><button v-if="selectedThread" class="plain-button members-toggle" :aria-expanded="showMembers" @click="showMembers = !showMembers">{{ selectedThread.members.length }} people / View &amp; add</button><p>{{ conversation ? 'Private · Andrew can also read this chat' : auth.user?.privateOnly ? 'Choose a conversation or start a new one' : `${data.people.length} active ${data.people.length === 1 ? 'member' : 'members'}` }}</p></div></div><div class="live-badge" :class="{ reconnecting: connection !== 'live' }"><span class="live-dot"></span>{{ connection === 'live' ? 'Live' : 'Connecting...' }}</div></div>
        <div v-if="selectedThread && showMembers" class="thread-members-panel"><div class="member-chips"><span v-for="member in selectedThread.members" :key="member.id"><span class="avatar small-avatar" :class="personTone(member.name)">{{ personInitial(member.name) }}</span>{{ member.name }}{{ member.active ? '' : ' (inactive)' }}<button v-if="auth.user?.role === 'admin'" class="plain-button danger-button" :aria-label="`Remove ${member.name} from conversation`" @click="removeMember(member.id, member.name)"><UiIcon name="close" /></button></span></div><form v-if="auth.user?.role === 'admin' || selectedThread.members.some(member => member.id === auth.user?.id)" class="settings-form" @submit.prevent="addMembers"><fieldset class="member-picker compact-picker"><legend>Add people</legend><label v-for="member in data.members.filter(member => !selectedThread!.members.some(existing => existing.id === member.id))" :key="member.id"><input v-model="additions" type="checkbox" :value="member.id">{{ member.name }}</label></fieldset><p class="field-help">People you add join immediately and can read this conversation's history.</p><button class="small-primary" :disabled="!additions.length || starting">Add selected people</button></form></div>
        <div class="playback-controls"><button class="plain-button" :aria-pressed="effectsEnabled" @click="effectsEnabled = !effectsEnabled"><SparkIcon /> Effects {{ effectsEnabled ? 'on' : 'off' }}</button><button class="plain-button" :aria-pressed="soundEnabled" @click="soundEnabled = !soundEnabled"><UiIcon :name="soundEnabled ? 'sound' : 'muted'" /> Sound {{ soundEnabled ? 'on' : 'off' }}</button><button v-if="conversation && auth.user?.role === 'admin'" class="plain-button danger-button" @click="deleteConversation"><UiIcon name="trash" /> Delete chat</button></div>
        <div ref="messageList" class="message-list" aria-live="polite" aria-relevant="additions text"><button v-if="historyEnd.hasMore && !error && !switching" class="load-history plain-button" :disabled="historyLoading" @click="loadOlder">{{ historyLoading ? 'Loading...' : 'Load older messages' }}</button><div v-if="error" class="empty-state"><span class="empty-sparkle"><UiIcon name="lock" /></span><p>{{ loadError }}</p><NuxtLink to="/" class="text-button">Back to conversations</NuxtLink></div><div v-else-if="switching || (pending && !messages.length)" class="empty-state"><p>Opening the conversation...</p></div><div v-else-if="!messages.length" class="empty-state"><span class="empty-sparkle"><MessageIcon /></span><h3>{{ conversation ? 'Just the start of a conversation.' : auth.user?.privateOnly ? 'Your people, a little closer.' : data.settings.welcome }}</h3><p>{{ auth.user?.privateOnly && !conversation ? 'Choose a private chat, or start a new conversation with an approved person.' : 'Say hello when you are ready.' }}</p></div><TransitionGroup v-else :name="`message-${data.settings.messageAnimation}`" tag="div" class="message-stack"><div key="conversation-start" class="conversation-start"><span>{{ conversation ? 'Private conversation' : 'Conversation' }}</span></div><article v-for="message in messages" :key="message.id" :id="'message-' + message.id" tabindex="-1" class="message-row" :class="{ 'own-message': message.sender === auth.user?.name }"><span class="avatar message-avatar" :class="personTone(message.sender)">{{ personInitial(message.sender) }}</span><div class="message-content"><div class="message-meta"><strong>{{ message.sender }}</strong><time :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time><span v-if="message.editedAt" class="edited-label">edited</span></div><form v-if="editingMessage?.id === message.id" class="message-edit-form" @submit.prevent="saveEdit"><textarea v-model="editingBody" maxlength="1000" rows="3" aria-label="Edit message"></textarea><div class="message-actions"><button class="small-primary" type="submit" :disabled="savingEdit || !editingBody.trim()"><UiIcon name="check" /> {{ savingEdit ? 'Saving...' : 'Save' }}</button><button class="plain-button" type="button" @click="editingMessage = null; editingBody = ''"><UiIcon name="close" /> Cancel</button></div></form><template v-else><MessageContent :message="message" :animated="effectsEnabled" :play="replay[message.id] || 0" @jump="jumpToMessage" /><button v-if="data.canSend" class="plain-button reply-action" @click="replyingTo = message"><UiIcon name="reply" /> Reply</button><button v-if="message.canEdit" class="plain-button" @click="startEditing(message)"><UiIcon name="edit" /> Edit</button><button v-if="message.canDelete" class="plain-button danger-button" :disabled="!!deletingMessage" :aria-label="`Delete message from ${message.sender}`" @click="removeMessage(message)"><UiIcon name="trash" /> {{ deletingMessage === message.id ? 'Deleting...' : 'Delete' }}</button><button v-if="message.effects?.text?.length || message.effects?.bubble || message.effects?.screen" class="plain-button replay-effect" :disabled="!effectsEnabled" @click="replayMessage(message)"><UiIcon name="play" /> Replay effect</button></template></div></article></TransitionGroup></div>
        <ChatComposer v-if="data.canSend && !switching && !error" :key="conversation" :conversation="conversation" :sender="auth.user?.name || ''" :reply-to="replyingTo" @cancel-reply="replyingTo = null" @sent="messageSent" @preview="playScreen" /><p v-else-if="conversation && !switching && !error" class="read-only-note"><UiIcon name="lock" /> {{ auth.user?.role === 'admin' ? 'You are reviewing this conversation. Use View & add to add yourself if you want to send messages.' : 'One of the participants is currently inactive.' }}</p><p v-if="sendError" class="form-error chat-send-error" role="alert">{{ sendError }}</p>
      </section>
    </main>
    <EffectBackdrop :effect="effectsEnabled ? screen.effect : undefined" :text="screen.text" :play="screen.play" :sound="soundEnabled" />
  </div>
</template>
