<script setup lang="ts">
import { DEFAULT_SETTINGS, type ChatSettings, type ChatState } from '#shared/types/chat'

const { data, refresh, error } = await useAsyncData('manage-state', () => $fetch<ChatState>('/api/state'), { default: () => ({ messages: [], settings: { ...DEFAULT_SETTINGS } }) })
const form = reactive<ChatSettings>({ ...data.value.settings })
const themeStyle = computed(() => chatThemeStyle(form))
const { connection } = useChatEvents(() => { void refresh() })
const saving = ref(false)
const restoring = ref(false)
const confirmRestore = ref(false)
const status = ref('')
const failure = ref('')
const settingsFeedback = ref('')
const settingsFailure = ref('')
const editingId = ref<string | null>(null)
const editingBody = ref('')
const previewKey = ref(0)

watch(() => data.value.settings, (next, previous) => {
  if (JSON.stringify(form) === JSON.stringify(previous)) Object.assign(form, next)
})

async function saveSettings() {
  saving.value = true
  status.value = ''
  failure.value = ''
  settingsFeedback.value = ''
  settingsFailure.value = ''
  try {
    await $fetch('/api/settings', { method: 'PUT', body: form })
    confirmRestore.value = false
    settingsFeedback.value = 'Changes saved for everyone.'
    await refresh()
  } catch (error: any) {
    settingsFailure.value = error?.data?.statusMessage || 'Could not save. Try again.'
  } finally {
    saving.value = false
  }
}

async function restoreDefaults() {
  if (saving.value) return
  saving.value = true
  restoring.value = true
  status.value = ''
  failure.value = ''
  settingsFeedback.value = ''
  settingsFailure.value = ''
  try {
    await $fetch('/api/settings', { method: 'PUT', body: { ...DEFAULT_SETTINGS } })
    Object.assign(form, DEFAULT_SETTINGS)
    confirmRestore.value = false
    settingsFeedback.value = 'All room settings restored to their defaults for everyone.'
    await refresh()
  } catch (error: any) {
    settingsFailure.value = error?.data?.statusMessage || 'Could not restore defaults. Try again.'
  } finally {
    restoring.value = false
    saving.value = false
  }
}

function startEditing(id: string, body: string) {
  editingId.value = id
  editingBody.value = body
  failure.value = ''
}

async function saveMessage() {
  if (!editingId.value || !editingBody.value.trim()) return
  saving.value = true
  failure.value = ''
  try {
    await $fetch(`/api/messages/${editingId.value}`, { method: 'PATCH', body: { body: editingBody.value } })
    editingId.value = null
    status.value = 'Message updated.'
    await refresh()
  } catch (error: any) {
    failure.value = error?.data?.statusMessage || 'Could not update the message.'
  } finally {
    saving.value = false
  }
}

async function removeMessage(id: string) {
  if (!window.confirm('Delete this message for everyone?')) return
  failure.value = ''
  status.value = ''
  try {
    await $fetch(`/api/messages/${id}`, { method: 'DELETE' })
    status.value = 'Message deleted.'
    await refresh()
  } catch (error: any) {
    failure.value = error?.data?.statusMessage || 'Could not delete the message.'
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Adelaide' }).format(new Date(date))
}

useHead({ title: 'Manage chat · SQ Chat' })
</script>

<template>
  <div class="site-shell manage-shell" :class="`bubble-${form.bubbleStyle}`" :style="themeStyle">
    <header class="topbar"><BrandLogo /><span class="topbar-caption">Room editor</span><NuxtLink to="/" class="topbar-link">← Back to chat</NuxtLink></header>
    <main class="manage-main">
      <div class="manage-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> PUBLIC CMS</div><h1>Make this space yours.</h1><p>Edit what appears in the room and manage the conversation.</p></div><div class="manage-pills"><span class="live-badge" :class="{ reconnecting: connection !== 'live' }"><span class="live-dot"></span>{{ connection === 'live' ? 'Live sync' : 'Connecting…' }}</span><span class="public-pill">Open to everyone</span></div></div>
      <p class="public-explainer">Anyone with the link can change this content and edit or delete messages. Changes appear in the chat automatically.</p>
      <div v-if="error" class="alert error-alert">Could not load room content. <button class="text-button" type="button" @click="refresh()">Try again</button></div>
      <div v-if="status" class="alert success-alert" role="status">{{ status }}</div>
      <div v-if="failure" class="alert error-alert" role="alert">{{ failure }}</div>
      <div class="manage-grid">
        <section class="manage-card"><div class="card-title"><span class="card-icon"><SparkIcon /></span><div><h2>Room content</h2><p>The words everyone sees in the chat.</p></div></div>
          <form class="settings-form" @submit.prevent="saveSettings">
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
            <div class="style-preview"><div class="preview-top"><strong>Preview</strong><button class="plain-button" type="button" @click="previewKey++">Play animation ↗</button></div><div :key="previewKey" class="preview-message" :class="[`preview-${form.messageAnimation}`, `preview-text-${form.textAnimation}`]"><span class="avatar andrew">A</span><span class="message-bubble">This is how a new message will look.</span></div></div>
            <div class="settings-actions">
              <button class="primary-button" type="submit" :disabled="saving">{{ saving && !restoring ? 'Saving…' : 'Save changes' }} <span aria-hidden="true">→</span></button>
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
        <section class="manage-card"><div class="card-title"><span class="card-icon messages-icon"><MessageIcon /></span><div><h2>Messages <span class="message-count">{{ data.messages.length }}</span></h2><p>Edit or remove anything in the conversation.</p></div></div>
          <div v-if="!data.messages.length" class="manage-empty">No messages yet. Go to the chat to start talking.</div>
          <div v-else class="manage-messages">
            <article v-for="message in [...data.messages].reverse()" :key="message.id" class="manage-message"><div class="manage-message-top"><strong>{{ message.sender }}</strong><time :datetime="message.createdAt">{{ formatDate(message.createdAt) }}</time></div>
              <template v-if="editingId === message.id"><textarea v-model="editingBody" maxlength="1000" rows="3" aria-label="Edit message"></textarea><div class="message-actions"><button class="small-primary" type="button" :disabled="saving || !editingBody.trim()" @click="saveMessage">Save</button><button class="plain-button" type="button" @click="editingId = null">Cancel</button></div></template>
              <template v-else><p>{{ message.body }}</p><div class="message-actions"><button class="plain-button" type="button" @click="startEditing(message.id, message.body)">Edit</button><button class="plain-button danger-button" type="button" @click="removeMessage(message.id)">Delete</button></div></template>
            </article>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
