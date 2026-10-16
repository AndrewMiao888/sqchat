<script setup lang="ts">
import { DEFAULT_SETTINGS, type ChatSettings, type ChatState } from '#shared/types/chat'

const { data, refresh, error } = await useAsyncData('manage-state', () => $fetch<ChatState>('/api/state'), { default: () => ({ messages: [], settings: { ...DEFAULT_SETTINGS } }) })
const form = reactive<ChatSettings>({ ...data.value.settings })
const saving = ref(false)
const status = ref('')
const failure = ref('')
const editingId = ref<string | null>(null)
const editingBody = ref('')
let poller: ReturnType<typeof setInterval> | undefined

async function saveSettings() {
  saving.value = true
  status.value = ''
  failure.value = ''
  try {
    await $fetch('/api/settings', { method: 'PUT', body: form })
    status.value = 'Room content saved.'
    await refresh()
  } catch (error: any) {
    failure.value = error?.data?.statusMessage || 'Could not save. Try again.'
  } finally {
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

onMounted(() => { poller = setInterval(() => { if (document.visibilityState === 'visible' && !editingId.value) refresh() }, 4000) })
onUnmounted(() => { if (poller) clearInterval(poller) })

useHead({ title: 'Manage chat · SQ Chat' })
</script>

<template>
  <div class="site-shell manage-shell">
    <header class="topbar"><NuxtLink to="/" class="brand"><span class="brand-mark">sq<span>.</span></span><span>chat</span></NuxtLink><span class="topbar-caption">Room editor</span><NuxtLink to="/" class="topbar-link">← Back to chat</NuxtLink></header>
    <main class="manage-main">
      <div class="manage-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> PUBLIC CMS</div><h1>Make this space yours.</h1><p>Edit what appears in the room and manage the conversation.</p></div><span class="public-pill">Open to everyone</span></div>
      <p class="public-explainer">Anyone with the link can change this content and edit or delete messages. Changes appear in the chat automatically.</p>
      <div v-if="error" class="alert error-alert">Could not load room content. <button class="text-button" type="button" @click="refresh()">Try again</button></div>
      <div v-if="status" class="alert success-alert" role="status">{{ status }}</div>
      <div v-if="failure" class="alert error-alert" role="alert">{{ failure }}</div>
      <div class="manage-grid">
        <section class="manage-card"><div class="card-title"><span class="card-icon">✳</span><div><h2>Room content</h2><p>The words everyone sees in the chat.</p></div></div>
          <form class="settings-form" @submit.prevent="saveSettings">
            <label>Room title <input v-model="form.title" maxlength="70" required placeholder="The group chat"></label>
            <label>Short description <input v-model="form.subtitle" maxlength="160" required placeholder="A little space for everyone."></label>
            <label>Room note <textarea v-model="form.notice" maxlength="280" required rows="3" placeholder="A note at the side of the chat."></textarea></label>
            <label>Empty chat message <input v-model="form.welcome" maxlength="160" required placeholder="The conversation starts here."></label>
            <button class="primary-button" type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save changes' }} <span aria-hidden="true">→</span></button>
          </form>
        </section>
        <section class="manage-card"><div class="card-title"><span class="card-icon messages-icon">☷</span><div><h2>Messages <span class="message-count">{{ data.messages.length }}</span></h2><p>Edit or remove anything in the conversation.</p></div></div>
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
