<script setup lang="ts">
import type { Conversation } from '#shared/types/auth'
import { DEFAULT_CONVERSATION_THEME, type ConversationTheme } from '#shared/types/chat'

type AppearanceMember = { id: string; name: string; sharedAllowed?: boolean; active?: boolean }
const props = defineProps<{
  conversation: string
  conversations: Conversation[]
  sharedAllowed: boolean
  members: AppearanceMember[]
}>()
const emit = defineEmits<{ 'update:conversation': [value: string]; saved: [] }>()
const { api } = useAuth()
const theme = ref<ConversationTheme>({ ...DEFAULT_CONVERSATION_THEME, senderColors: {} })
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const status = ref('')
const failure = ref('')
const filePicker = ref<HTMLInputElement | null>(null)
const palette = ['#dceaff', '#ffe1e8', '#dcf2df', '#fff0cb', '#e9e0ff', '#d9f1ef', '#f5e1d1', '#e5e8ec']
const chatMembers = computed(() => props.conversation
  ? props.conversations.find(thread => thread.id === props.conversation)?.members || []
  : props.members.filter(member => member.sharedAllowed))
const previewBubbleColor = computed(() => {
  const firstMember = chatMembers.value[0]
  return firstMember ? theme.value.senderColors[firstMember.id] || theme.value.bubbleColor : theme.value.bubbleColor
})

watch(() => props.conversation, async selected => {
  loading.value = true
  status.value = ''; failure.value = ''
  try {
    const result = await api<{ theme: ConversationTheme }>('/api/admin/conversation-theme', { query: { conversation: selected || '' } })
    if (selected === props.conversation) theme.value = { ...DEFAULT_CONVERSATION_THEME, ...result.theme, senderColors: { ...result.theme.senderColors } }
  } catch (error: any) { if (selected === props.conversation) failure.value = error?.data?.statusMessage || 'Could not load this chat’s appearance.' }
  finally { if (selected === props.conversation) loading.value = false }
}, { immediate: true })

function memberColor(index: number, id: string) { return theme.value.senderColors[id] || palette[index % palette.length] }
function setMemberColor(id: string, value: string) { theme.value.senderColors = { ...theme.value.senderColors, [id]: value } }
function resetMemberColor(id: string) {
  theme.value.senderColors = { ...theme.value.senderColors, [id]: theme.value.bubbleColor }
}
function threadLabel(thread: Conversation) { return thread.title || thread.members.map(member => member.name).join(', ') }
async function uploadPicture(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true; failure.value = ''; status.value = ''
  try {
    const prepared = await api<{ id: string; pathname: string; token: string; contentType: string }>('/api/admin/theme-background/prepare', {
      method: 'POST', body: { name: file.name, size: file.size, conversation: props.conversation || null }
    })
    const { put } = await import('@vercel/blob/client')
    await put(prepared.pathname, file, { access: 'private', token: prepared.token, contentType: prepared.contentType, multipart: file.size > 5 * 1024 * 1024 })
    await api(`/api/admin/theme-background/${encodeURIComponent(prepared.id)}/complete`, { method: 'POST', body: {} })
    theme.value.backgroundImageId = prepared.id
    theme.value.backgroundMode = 'image'
    status.value = 'Picture uploaded. Save the appearance to show it to everyone in this chat.'
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not upload this picture.' }
  finally { uploading.value = false; (event.target as HTMLInputElement).value = '' }
}
async function save() {
  if (saving.value || loading.value || uploading.value) return
  saving.value = true; status.value = ''; failure.value = ''
  try {
    const senderColors = { ...theme.value.senderColors }
    chatMembers.value.forEach((member, index) => { senderColors[member.id] ||= palette[index % palette.length]! })
    const result = await api<{ theme: ConversationTheme }>('/api/admin/conversation-theme', {
      method: 'PUT', body: { ...theme.value, senderColors, conversation: props.conversation || null }
    })
    theme.value = { ...result.theme, senderColors: { ...result.theme.senderColors } }
    status.value = 'Appearance saved for this conversation.'
    emit('saved')
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not save this chat’s appearance.' }
  finally { saving.value = false }
}
function previewStyle() {
  const image = theme.value.backgroundMode === 'image' && theme.value.backgroundImageId
    ? `url("/api/theme-background/${theme.value.backgroundImageId}")`
    : theme.value.backgroundMode === 'gradient'
      ? `linear-gradient(${theme.value.gradientAngle}deg, ${theme.value.backgroundStart}, ${theme.value.backgroundEnd})`
      : theme.value.backgroundStart
  return {
    background: image,
    backgroundColor: theme.value.backgroundStart,
    backgroundSize: 'cover',
    '--chat-panel-bg': theme.value.panelColor,
    '--chat-bubble-bg': theme.value.bubbleColor,
    '--chat-accent': theme.value.accentColor
  }
}
</script>

<template>
  <section class="manage-card conversation-appearance">
    <div class="card-title"><span class="card-icon"><UiIcon name="image" /></span><div><h2>Chat appearance</h2><p>Choose a look for each conversation and a bubble colour for every person.</p></div></div>
    <form class="settings-form" @submit.prevent="save">
      <label>Conversation<select :value="conversation" :disabled="loading || saving || uploading" @change="emit('update:conversation', ($event.target as HTMLSelectElement).value)"><option v-if="sharedAllowed" value="">Everyone / shared room</option><option v-for="thread in conversations" :key="thread.id" :value="thread.id">{{ threadLabel(thread) }}</option></select></label>
      <p v-if="loading" class="field-help" role="status">Loading this chat’s appearance…</p>
      <div class="form-section-heading"><h3>Background</h3><p>Set a solid colour, a gradient with your own angle, or a picture.</p></div>
      <label>Background style<select v-model="theme.backgroundMode"><option value="solid">Solid colour</option><option value="gradient">Gradient</option><option value="image">Picture</option></select></label>
      <div v-if="theme.backgroundMode !== 'image'" class="colour-grid">
        <label>{{ theme.backgroundMode === 'gradient' ? 'First colour' : 'Background colour' }}<span class="colour-control"><input v-model="theme.backgroundStart" type="color"><code>{{ theme.backgroundStart }}</code></span></label>
        <label v-if="theme.backgroundMode === 'gradient'">Second colour<span class="colour-control"><input v-model="theme.backgroundEnd" type="color"><code>{{ theme.backgroundEnd }}</code></span></label>
      </div>
      <label v-if="theme.backgroundMode === 'gradient'">Gradient angle <span class="angle-control"><input v-model.number="theme.gradientAngle" type="range" min="0" max="360"><output>{{ theme.gradientAngle }}°</output></span></label>
      <div v-if="theme.backgroundMode === 'image'" class="appearance-upload">
        <input ref="filePicker" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" @change="uploadPicture">
        <div v-if="theme.backgroundImageId" class="background-image-preview" :style="{ backgroundImage: `url('/api/theme-background/${theme.backgroundImageId}')` }" role="img" aria-label="Selected chat background picture"></div>
        <p class="field-help">JPEG, PNG or WebP, up to 5 MB. Only members of this chat can view its picture.</p>
        <div class="appearance-actions"><button class="restore-button" type="button" :disabled="uploading" @click="filePicker?.click()">{{ uploading ? 'Uploading…' : theme.backgroundImageId ? 'Choose another picture' : 'Upload a picture' }}</button><button v-if="theme.backgroundImageId" class="plain-button danger-button" type="button" @click="theme.backgroundImageId = null; theme.backgroundMode = 'solid'">Remove picture</button></div>
      </div>
      <div class="colour-grid">
        <label>Chat panel<span class="colour-control"><input v-model="theme.panelColor" type="color"><code>{{ theme.panelColor }}</code></span></label>
        <label>Default message bubbles<span class="colour-control"><input v-model="theme.bubbleColor" type="color"><code>{{ theme.bubbleColor }}</code></span></label>
        <label>Accent colour<span class="colour-control"><input v-model="theme.accentColor" type="color"><code>{{ theme.accentColor }}</code></span></label>
      </div>
      <div class="form-section-heading"><h3>People in this chat</h3><p>Pick a separate message bubble colour for each person.</p></div>
      <div v-if="chatMembers.length" class="theme-member-colors">
        <div v-for="(member, index) in chatMembers" :key="member.id" class="theme-member-row"><span class="theme-member-name">{{ member.name }}</span><span class="colour-control"><input type="color" :aria-label="`Message colour for ${member.name}`" :value="memberColor(index, member.id)" @input="setMemberColor(member.id, ($event.target as HTMLInputElement).value)"><code>{{ memberColor(index, member.id) }}</code></span><button class="plain-button" type="button" @click="resetMemberColor(member.id)">Default</button></div>
      </div>
      <p v-else class="field-help">No active people are available in this conversation yet.</p>
      <div class="appearance-preview" :style="previewStyle()"><div class="appearance-preview-panel"><strong>Live preview</strong><p class="appearance-preview-bubble" :style="{ background: previewBubbleColor }">A message from {{ chatMembers[0]?.name || 'someone' }}</p><span>Chat colours update for everyone after saving.</span></div></div>
      <button class="primary-button" type="submit" :disabled="saving || loading || uploading">{{ saving ? 'Saving…' : 'Save appearance' }} <UiIcon name="arrow-right" /></button>
      <p v-if="status" class="settings-feedback settings-feedback-success" role="status">{{ status }}</p>
      <p v-if="failure" class="settings-feedback settings-feedback-error" role="alert">{{ failure }}</p>
    </form>
  </section>
</template>
