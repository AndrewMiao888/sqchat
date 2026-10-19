<script setup lang="ts">
import { TEXT_EFFECTS, BUBBLE_EFFECTS, SCREEN_EFFECTS, FILE_ACCEPT, MAX_ATTACHMENTS, MAX_FILE_SIZE, fileSize, type Attachment, type MessageEffects, type TextEffect, type ScreenEffect } from '#shared/types/media'
import type { ChatMessage } from '#shared/types/chat'
const props = defineProps<{ conversation: string; sender: string; replyTo?: ChatMessage | null }>()
const emit = defineEmits<{ sent: []; cancelReply: []; preview: [effect: ScreenEffect, text: string] }>()
const { api } = useAuth()
const interactive = ref(false)
onMounted(() => { interactive.value = true })
const draft = ref(''), failure = ref(''), sending = ref(false), effectOpen = ref(false)
const effectTab = ref<'text' | 'bubble' | 'screen'>('text')
const effects = ref<MessageEffects>({})
const autoScreen = ref(true)
const previewKey = ref(0)
const textarea = ref<HTMLTextAreaElement | null>(null)
const picker = ref<HTMLInputElement | null>(null)
const selection = ref({ start: 0, end: 0 })
let typingActive = false
let typingId = ''
let typingTimer: ReturnType<typeof setInterval> | undefined
let typingQueue: Promise<unknown> = Promise.resolve()
function reportTyping(typing: boolean) {
  typingQueue = typingQueue.catch(() => {}).then(() => api('/api/presence/typing', { method: 'POST', body: { conversation: props.conversation || null, tabId: typingId, typing } })).catch(() => {})
}
function stopTyping() {
  if (typingTimer) clearInterval(typingTimer)
  typingTimer = undefined
  if (typingActive) { typingActive = false; reportTyping(false) }
}
function startTyping() {
  if (sending.value || !draft.value.trim() || document.visibilityState !== 'visible' || document.activeElement !== textarea.value) { stopTyping(); return }
  if (typingActive) return
  typingId ||= crypto.randomUUID()
  typingActive = true
  reportTyping(true)
  typingTimer = setInterval(() => {
    if (sending.value || !draft.value.trim() || document.visibilityState !== 'visible' || document.activeElement !== textarea.value) stopTyping()
    else reportTyping(true)
  }, 4000)
}
function typingVisibilityChanged() { if (document.visibilityState === 'visible') startTyping(); else stopTyping() }
onMounted(() => document.addEventListener('visibilitychange', typingVisibilityChanged))
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', typingVisibilityChanged); stopTyping() })
type Upload = { localId: string; id?: string; name: string; size: number; type: string; progress: number; status: 'uploading' | 'ready' | 'error'; error?: string; controller: AbortController }
const uploads = ref<Upload[]>([])
const { recovery, unsent } = useAppRecovery()
watch([draft, () => uploads.value.length], ([text, files]) => { unsent.value = { text, files } }, { flush: 'sync' })
onBeforeUnmount(() => { if (!recovery.value.failed) unsent.value = { text: '', files: 0 } })
const uploading = computed(() => uploads.value.some(file => file.status === 'uploading'))
const ready = computed(() => uploads.value.filter(file => file.status === 'ready'))
const hasDraft = computed(() => !!draft.value.trim() || !!uploads.value.length)
const canSend = computed(() => interactive.value && !sending.value && !uploading.value && !uploads.value.some(file => file.status === 'error') && (!!draft.value.trim() || !!ready.value.length))
const previewMessage = computed<ChatMessage>(() => ({ id: 'preview', sender: props.sender, createdAt: new Date().toISOString(), body: draft.value.trim() || 'A little more expression.', effects: effects.value, replyTo: props.replyTo ? { id: props.replyTo.id, sender: props.replyTo.sender, body: props.replyTo.effects?.bubble === 'invisible' ? 'Invisible ink message' : props.replyTo.body.slice(0, 240) || 'Attachment' } : undefined }))
let pressTimer: ReturnType<typeof setTimeout> | undefined
let longPressed = false
let disposed = false
function captureSelection() { if (textarea.value) selection.value = { start: textarea.value.selectionStart, end: textarea.value.selectionEnd } }
function addTextEffect(effect: TextEffect) {
  const leading = draft.value.length - draft.value.trimStart().length
  const end = draft.value.trim().length
  const selected = selection.value.end > selection.value.start
  const span = { effect, start: selected ? Math.max(0, selection.value.start - leading) : 0, end: selected ? Math.min(end, selection.value.end - leading) : end }
  if (span.end <= span.start) return
  effects.value.text = [...(effects.value.text || []).filter(item => item.end <= span.start || item.start >= span.end), span].slice(-12)
  previewKey.value++
}
function startPress() { longPressed = false; pressTimer = setTimeout(() => { longPressed = true; effectOpen.value = true; effectTab.value = 'bubble' }, 450) }
function endPress() { clearTimeout(pressTimer) }
function sendClick() { endPress(); if (longPressed) { longPressed = false; return }; void send() }
function keydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send() } }
function textChanged() { effects.value.text = []; captureSelection(); startTyping() }
async function attach(files: FileList | File[] | null) {
  if (!files || sending.value || disposed) return
  failure.value = ''
  for (const file of Array.from(files)) {
    if (disposed) break
    if (uploads.value.length >= MAX_ATTACHMENTS) { failure.value = 'Attach up to four files per message.'; break }
    if (!file.size || file.size > MAX_FILE_SIZE) { failure.value = `${file.name}: choose a file under 20 MB.`; continue }
    const entry: Upload = { localId: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, progress: 0, status: 'uploading', controller: new AbortController() }
    uploads.value.push(entry)
    const local = uploads.value.at(-1)!
    try {
      const prepared = await api('/api/attachments/prepare', { method: 'POST', body: { name: file.name, size: file.size, conversation: props.conversation } })
      local.id = prepared.id; local.type = prepared.contentType
      if (local.controller.signal.aborted) { await api(`/api/attachments/${local.id}`, { method: 'DELETE', body: {} }); continue }
      const { put } = await import('@vercel/blob/client')
      await put(prepared.pathname, file, { access: 'private', token: prepared.token, contentType: prepared.contentType, abortSignal: local.controller.signal, onUploadProgress: progress => { local.progress = Math.round(progress.percentage) } })
      await api(`/api/attachments/${prepared.id}/complete`, { method: 'POST', body: {} })
      local.status = 'ready'; local.progress = 100
    } catch (error: any) {
      if (!local.controller.signal.aborted) { local.status = 'error'; local.error = error?.data?.statusMessage || 'Upload failed. Remove this file and try again.' }
    }
  }
  if (picker.value) picker.value.value = ''
}
async function removeUpload(file: Upload) {
  file.controller.abort(); uploads.value = uploads.value.filter(item => item.localId !== file.localId)
  if (file.id) await api(`/api/attachments/${file.id}`, { method: 'DELETE', body: {} }).catch(() => {})
}
watch(() => props.replyTo?.id, () => { if (props.replyTo) nextTick(() => textarea.value?.focus()) })
async function send() {
  if (!canSend.value) return
  sending.value = true; failure.value = ''; stopTyping()
  try {
    await api('/api/messages', { method: 'POST', body: { body: draft.value.trim(), conversation: props.conversation, attachments: ready.value.map(file => file.id), effects: effects.value, autoScreen: autoScreen.value, replyTo: props.replyTo?.id } })
    draft.value = ''; uploads.value = []; effects.value = {}; effectOpen.value = false; emit('sent'); textarea.value?.focus()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Message could not be sent. Your draft is still here.' }
  finally { sending.value = false; startTyping() }
}
function allowLeave() { return !hasDraft.value || window.confirm('Discard this unsent message and its attachments?') }
onBeforeRouteLeave(allowLeave)
onBeforeRouteUpdate((to, from) => to.query.chat === from.query.chat || allowLeave())
onBeforeUnmount(() => { disposed = true; endPress(); for (const file of uploads.value) { file.controller.abort(); if (file.id) void api(`/api/attachments/${file.id}`, { method: 'DELETE', body: {} }).catch(() => {}) } })
</script>
<template>
  <form class="composer rich-composer" @submit.prevent="send" @dragover.prevent @drop.prevent="attach($event.dataTransfer?.files || null)">
    <div class="composer-identity"><span>Sending as <strong>{{ sender }}</strong></span><span class="composer-tip">Enter to send · Hold send for effects</span></div>
    <div v-if="replyTo" class="reply-draft"><UiIcon name="reply" /><div><strong>Replying to {{ replyTo.sender }}</strong><p>{{ replyTo.effects?.bubble === 'invisible' ? 'Invisible ink message' : replyTo.body.slice(0, 160) || 'Attachment' }}</p></div><button class="plain-button" type="button" aria-label="Cancel reply" @click="emit('cancelReply')"><UiIcon name="close" /></button></div>
    <div v-if="uploads.length" class="upload-tray"><div v-for="file in uploads" :key="file.localId" class="upload-item"><UiIcon :name="file.type.startsWith('image/') ? 'image' : 'file'" /><div><strong>{{ file.name }}</strong><small>{{ file.status === 'uploading' ? `Uploading ${file.progress}%` : file.status === 'error' ? file.error : fileSize(file.size) + ' / Ready' }}</small><progress v-if="file.status === 'uploading'" :value="file.progress" max="100"></progress></div><button type="button" :aria-label="`Remove ${file.name}`" @click="removeUpload(file)"><UiIcon name="close" /></button></div></div>
    <div class="composer-box"><textarea ref="textarea" v-model="draft" aria-label="Your message" placeholder="Write a message or drop a file..." rows="2" maxlength="1000" :disabled="!interactive || sending" @keydown="keydown" @select="captureSelection" @keyup="captureSelection" @mouseup="captureSelection" @input="textChanged" @focus="startTyping" @blur="stopTyping" @paste="event => { if (event.clipboardData?.files.length) { event.preventDefault(); attach(event.clipboardData.files) } }"></textarea><button class="send-button" type="button" :disabled="!canSend" :aria-label="sending ? 'Sending message' : 'Send message. Hold for effects.'" @click="sendClick" @pointerdown="startPress" @pointerup="endPress" @pointercancel="endPress" @pointerleave="endPress" @contextmenu.prevent="effectOpen = true; effectTab = 'bubble'"><UiIcon name="arrow-up" /></button></div>
    <div class="composer-tools"><input ref="picker" type="file" multiple :accept="FILE_ACCEPT" hidden @change="attach(($event.target as HTMLInputElement).files)"><button class="plain-button" type="button" :disabled="!interactive || sending || uploads.length >= MAX_ATTACHMENTS" @click="picker?.click()"><UiIcon name="paperclip" /> Attach</button><button class="plain-button" type="button" :disabled="!interactive" :aria-expanded="effectOpen" @click="effectOpen = !effectOpen"><SparkIcon /> Effects<span v-if="effects.text?.length || effects.bubble || effects.screen" class="effect-active-dot"></span></button><span class="composer-limit">{{ draft.length }}/1000 · 20 MB per file</span></div>
    <div v-if="effectOpen" class="effects-panel"><div class="effects-panel-heading"><strong>Send with a little more expression</strong><button class="plain-button" type="button" aria-label="Close effects" @click="effectOpen = false"><UiIcon name="close" /></button></div><div class="effect-tabs" role="group" aria-label="Effect category"><button v-for="tab in (['text','bubble','screen'] as const)" :key="tab" type="button" :class="{ active: effectTab === tab }" :aria-pressed="effectTab === tab" @click="effectTab = tab">{{ tab }}</button></div>
      <template v-if="effectTab === 'text'"><p class="field-help">Select words in your message first, or apply an effect to all text. Editing your message clears its word effects.</p><div class="effect-options"><button v-for="effect in TEXT_EFFECTS" :key="effect" type="button" :disabled="!draft.trim()" @click="addTextEffect(effect)">{{ effect }}</button></div></template>
      <div v-else-if="effectTab === 'bubble'" class="effect-options"><button v-for="effect in BUBBLE_EFFECTS" :key="effect" type="button" :class="{ active: effects.bubble === effect }" :aria-pressed="effects.bubble === effect" @click="effects.bubble = effect; previewKey++">{{ effect === 'invisible' ? 'Invisible ink' : effect }}</button><button type="button" @click="delete effects.bubble; previewKey++">None</button></div>
      <template v-else><div class="effect-options"><button v-for="effect in SCREEN_EFFECTS" :key="effect" type="button" :class="{ active: effects.screen === effect }" :aria-pressed="effects.screen === effect" @click="effects.screen = effect; emit('preview', effect, draft)">{{ effect }}</button><button type="button" @click="delete effects.screen; autoScreen = false">None</button></div><label class="effect-checkbox"><input v-model="autoScreen" type="checkbox">Automatically celebrate greetings like Happy Birthday, Congrats, and Happy New Year</label></template>
      <div class="effect-preview"><MessageContent :message="previewMessage" :play="previewKey" /><div class="message-actions"><button class="plain-button" type="button" @click="previewKey++; if (effects.screen) emit('preview', effects.screen, draft)"><UiIcon name="rotate" /> Replay preview</button><button class="plain-button" type="button" @click="effects = {}; previewKey++; autoScreen = false">Clear effects</button></div></div>
    </div>
    <p v-if="failure" class="form-error" role="alert">{{ failure }}</p>
  </form>
</template>
