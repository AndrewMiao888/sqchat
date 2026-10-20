<script setup lang="ts">
import { DEFAULT_SETTINGS, type ChatSettings, type ChatState } from '#shared/types/chat'
import type { Conversation } from '#shared/types/auth'
import type { ChatMessage } from '#shared/types/chat'
import type { MessageEffects } from '#shared/types/media'
definePageMeta({ middleware: 'admin' })
const { auth, api } = useAuth()
const isAdmin = computed(() => auth.value.user?.role === 'admin')
const canEditRoom = computed(() => !!auth.value.user?.canEditCms)
const canModerate = computed(() => !!auth.value.user?.canModerateMessages)
const accessSummary = computed(() => isAdmin.value
  ? 'You can approve accounts, choose room editors and moderators, and manage conversations. Everyone sees saved room changes live.'
  : canEditRoom.value && canModerate.value
    ? 'Andrew gave you room editing and message moderation access in chats you can open.'
    : canModerate.value
      ? 'Andrew gave you message moderation access in chats you can open.'
      : 'Andrew gave you access to edit room content and appearance. Everyone sees saved changes live.')
const manageIntro = computed(() => isAdmin.value
  ? 'Edit the room and manage conversations.'
  : canEditRoom.value && canModerate.value
    ? 'Edit the room and moderate messages in your chats.'
    : canModerate.value ? 'Moderate messages in your chats.' : 'Edit what appears in the room.')
watch([canEditRoom, canModerate], ([editing, moderating]) => { if (!editing && !moderating) void navigateTo('/') })
const conversation = ref('')
const { data, refresh, error } = await useAsyncData('manage-state', () => api<ChatState>('/api/state', { query: { conversation: conversation.value } }), { default: emptyChatState, watch: [conversation] })
onMounted(() => { if (auth.value.user?.privateOnly && !conversation.value) conversation.value = data.value.conversations[0]?.id || '' })
const { data: auditLog, refresh: refreshAudit } = await useAsyncData('audit', () => isAdmin.value ? api<any[]>('/api/admin/audit') : Promise.resolve([]), { default: () => [] })
const form = reactive<ChatSettings>({ ...data.value.settings })
useHead(() => ({ link: [{ rel: 'icon', type: 'image/svg+xml', key: 'favicon', href: '/favicon.svg?accent=' + encodeURIComponent(form.accentColor) }] }))
const themeStyle = computed(() => chatThemeStyle(form))
const { connection } = useChatEvents(() => { void refresh(); if (isAdmin.value) void refreshAudit() })
const saving = ref(false)
const restoring = ref(false)
const confirmRestore = ref(false)
const status = ref('')
const failure = ref('')
const settingsFeedback = ref('')
const settingsFailure = ref('')
const editingId = ref<string | null>(null)
const editingBody = ref('')
const editingEffects = ref<MessageEffects>({})
const previewKey = ref(0)
watch(() => data.value.settings, (next, previous) => {
  if (JSON.stringify(form) === JSON.stringify(previous)) Object.assign(form, next)
})
watch(conversation, () => { editingId.value = null; failure.value = ''; status.value = '' })
async function saveSettings(defaults = false) {
  if (saving.value) return
  saving.value = true; restoring.value = defaults
  settingsFeedback.value = ''; settingsFailure.value = ''
  try {
    await api('/api/settings', { method: 'PUT', body: defaults ? { ...DEFAULT_SETTINGS } : form })
    if (defaults) Object.assign(form, DEFAULT_SETTINGS)
    confirmRestore.value = false
    settingsFeedback.value = defaults ? 'All room settings restored to their defaults for everyone.' : 'Changes saved for everyone.'
    await refresh()
  } catch (error: any) { settingsFailure.value = error?.data?.statusMessage || 'Could not save. Try again.' }
  finally { saving.value = false; restoring.value = false }
}
const restoreDefaults = () => saveSettings(true)
function startEditing(message: ChatMessage) { editingId.value = message.id; editingBody.value = message.body; editingEffects.value = structuredClone(message.effects || {}); failure.value = '' }
async function saveMessage() {
  if (!editingId.value || !editingBody.value.trim()) return
  saving.value = true; failure.value = ''
  try {
    await api('/api/messages/' + editingId.value, { method: 'PATCH', body: { body: editingBody.value, effects: editingEffects.value } })
    editingId.value = null; status.value = 'Message updated.'; await refresh()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not update the message.' }
  finally { saving.value = false }
}
async function removeMessage(id: string) {
  if (!window.confirm('Delete this message for everyone in this conversation?')) return
  failure.value = ''; status.value = ''
  try {
    await api('/api/messages/' + id, { method: 'DELETE', body: {} })
    status.value = 'Message deleted.'; await refresh()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not delete the message.' }
}
async function removeConversation() {
  if (!window.confirm(conversation.value ? 'Delete this conversation and every message and file for everyone?' : 'Clear all shared-room messages and files for everyone?')) return
  try { await api('/api/conversations/' + (conversation.value || 'shared'), { method: 'DELETE', body: {} }); conversation.value = ''; await refresh(); status.value = 'Conversation cleared.' }
  catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not delete the conversation.' }
}
function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Adelaide' }).format(new Date(date))
}
function threadLabel(thread: Conversation) { return thread.title || thread.members.map(member => member.name).join(', ') }
useHead({ title: 'Manage chat / SQ Chat' })
</script>

<template>
  <div class="site-shell manage-shell" :class="`bubble-${form.bubbleStyle}`" :style="themeStyle">
    <header class="topbar"><BrandLogo /><span class="topbar-caption">{{ canEditRoom ? 'Room editor' : 'Message moderation' }}</span><NuxtLink to="/" class="topbar-link"><UiIcon name="arrow-left" /> Back to chat</NuxtLink></header>
    <main class="manage-main">
      <div class="manage-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> {{ canEditRoom ? 'ROOM SETTINGS' : 'MESSAGE MODERATION' }}</div><h1>{{ canEditRoom ? 'Make this space yours.' : 'Keep the conversation welcoming.' }}</h1><p>{{ manageIntro }}</p></div><div class="manage-pills"><span class="live-badge" :class="{ reconnecting: connection !== 'live' }"><span class="live-dot"></span>{{ connection === 'live' ? 'Live sync' : 'Connecting…' }}</span><span class="public-pill">{{ isAdmin ? 'Administrator' : canEditRoom && canModerate ? 'Room editor and moderator' : canModerate ? 'Moderator' : 'Room editor' }}</span></div></div>
      <p class="public-explainer">{{ accessSummary }}</p>
      <div v-if="error" class="alert error-alert">Could not load room content. <button class="text-button" type="button" @click="refresh()">Try again</button></div>
      <div v-if="status" class="alert success-alert" role="status">{{ status }}</div>
      <div v-if="failure" class="alert error-alert" role="alert">{{ failure }}</div>
      <div class="manage-grid" :class="{ 'cms-only': !(canEditRoom && canModerate) }">
        <section v-if="canEditRoom" class="manage-card"><div class="card-title"><span class="card-icon"><SparkIcon /></span><div><h2>Room content</h2><p>The words everyone sees in the chat.</p></div></div>
          <form class="settings-form" @submit.prevent="saveSettings()">
            <label>Room title <input v-model="form.title" maxlength="70" required placeholder="The group chat"></label>
            <label>Short description <input v-model="form.subtitle" maxlength="160" required placeholder="A little space for everyone."></label>
            <label>Room note <textarea v-model="form.notice" maxlength="280" required rows="3" placeholder="A note at the side of the chat."></textarea></label>
            <label>Empty chat message <input v-model="form.welcome" maxlength="160" required placeholder="The conversation starts here."></label>
            <div class="form-section-heading"><h3>Colours</h3><p>Pick the background, message and accent colours.</p></div>
            <div class="colour-grid">
              <label>Page background <span class="colour-control"><input v-model="form.pageBackground" type="color"><code>{{ form.pageBackground }}</code></span></label>
              <label>Chat background <span class="colour-control"><input v-model="form.panelBackground" type="color"><code>{{ form.panelBackground }}</code></span></label>
              <label>Message bubbles <span class="colour-control"><input v-model="form.bubbleBackground" type="color"><code>{{ form.bubbleBackground }}</code></span></label>
              <label>Accent colour <span class="colour-control"><input v-model="form.accentColor" type="color"><code>{{ form.accentColor }}</code></span></label>
              <label>Text colour <span class="colour-control"><input v-model="form.textColor" type="color"><code>{{ form.textColor }}</code></span></label>
            </div>
            <div class="form-section-heading"><h3>Type & motion</h3><p>These choices update for everyone when saved.</p></div>
            <div class="style-grid">
              <label>Font <select v-model="form.fontFamily"><option value="sans">Clean sans</option><option value="rounded">Rounded</option><option value="serif">Classic serif</option><option value="mono">Monospace</option></select></label>
              <label>Message entrance <select v-model="form.messageAnimation"><option value="pop">Pop</option><option value="bubble">Bubble</option><option value="slide">Slide in</option><option value="none">None</option></select></label>
              <label>Text motion <select v-model="form.textAnimation"><option value="fade">Fade in</option><option value="rise">Rise in</option><option value="reveal">Reveal</option><option value="none">None</option></select></label>
              <label>Bubble corners <select v-model="form.bubbleStyle"><option value="soft">Soft</option><option value="pill">Rounded</option><option value="square">Square</option></select></label>
            </div>
            <div class="style-preview"><div class="preview-top"><strong>Preview</strong><button class="plain-button" type="button" @click="previewKey++">Play animation <UiIcon name="arrow-up-right" /></button></div><div :key="previewKey" class="preview-message" :class="[`preview-${form.messageAnimation}`, `preview-text-${form.textAnimation}`]"><span class="avatar andrew">A</span><span class="message-bubble">This is how a new message will look.</span></div></div>
            <div class="settings-actions">
              <button class="primary-button" type="submit" :disabled="saving">{{ saving && !restoring ? 'Saving…' : 'Save changes' }} <UiIcon name="arrow-right" /></button>
              <button class="restore-button" type="button" :disabled="saving" :aria-expanded="confirmRestore" aria-controls="restore-confirmation" @click="confirmRestore = !confirmRestore">Restore all defaults</button>
            </div>
            <p v-if="settingsFeedback" class="settings-feedback settings-feedback-success" role="status">{{ settingsFeedback }}</p>
            <p v-if="settingsFailure" class="settings-feedback settings-feedback-error" role="alert">{{ settingsFailure }}</p>
            <div v-if="confirmRestore" id="restore-confirmation" class="restore-confirmation" role="group" aria-label="Confirm restoring defaults">
              <div><strong>Restore every room setting?</strong><p>This replaces the room text, colours, font and animations for everyone, including any unsaved edits here. Messages stay in the chat.</p></div>
              <div class="restore-confirmation-actions"><button class="restore-confirm-button" type="button" :disabled="saving" @click="restoreDefaults">{{ restoring ? 'Restoring…' : 'Yes, restore defaults' }}</button><button class="plain-button" type="button" :disabled="saving" @click="confirmRestore = false">Cancel</button></div>
            </div>
          </form>
        </section>
        <div v-if="canModerate" class="manage-side-column">
        <ReminderControls v-if="isAdmin" :settings="data.reminderSettings" />
        <ChatRequests v-if="isAdmin" />
        <AccountManager v-if="isAdmin" />
        <section class="manage-card"><div class="card-title"><span class="card-icon messages-icon"><MessageIcon /></span><div><h2>Messages <span class="message-count">{{ data.messages.length }}</span></h2><p>Edit or remove anything in the conversation.</p></div></div>
          <label class="conversation-filter">Conversation<select v-model="conversation"><option v-if="!auth.user?.privateOnly" value="">Everyone / shared room</option><option v-for="thread in data.conversations" :key="thread.id" :value="thread.id">{{ threadLabel(thread) }}</option></select></label>
          <button v-if="isAdmin" class="plain-button danger-button" @click="removeConversation"><UiIcon name="trash" /> {{ conversation ? 'Delete conversation' : 'Clear shared room' }}</button>
          <div v-if="!data.messages.length" class="manage-empty">No messages yet. Go to the chat to start talking.</div>
          <div v-else class="manage-messages">
            <article v-for="message in [...data.messages].reverse()" :key="message.id" class="manage-message"><div class="manage-message-top"><strong>{{ message.sender }}</strong><time :datetime="message.createdAt">{{ formatDate(message.createdAt) }}</time></div>
              <template v-if="editingId === message.id"><MessageEditFields v-model:body="editingBody" v-model:effects="editingEffects" :sender="message.sender" /><div class="message-actions"><button class="small-primary" type="button" :disabled="saving || !editingBody.trim()" @click="saveMessage">Save</button><button class="plain-button" type="button" @click="editingId = null">Cancel</button></div></template>
              <template v-else><MessageContent :message="message" :animated="false" /><div class="message-actions"><button v-if="message.canEdit" class="plain-button" type="button" @click="startEditing(message)">Edit</button><button v-if="message.canDelete" class="plain-button danger-button" type="button" @click="removeMessage(message.id)">Delete</button></div></template>
            </article>
          </div>
        </section>
<section v-if="isAdmin" class="manage-card"><div class="card-title"><span class="card-icon"><UiIcon name="shield" /></span><div><h2>Security activity</h2><p>Recent sign-ins and account changes. Passwords and message contents are never recorded here.</p></div></div><div class="audit-list"><article v-for="(entry, index) in auditLog" :key="index"><strong>{{ entry.action.replaceAll('.', ' / ').replaceAll('-', ' ') }}</strong><p>{{ entry.actor || 'Visitor' }}<span v-if="entry.target"> / {{ entry.target }}</span></p><time :datetime="entry.createdAt">{{ formatDate(entry.createdAt) }}</time></article></div></section>
        </div>
      </div>
    </main>
  </div>
</template>
