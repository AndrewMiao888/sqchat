<script setup lang="ts">
import { fileSize, type Attachment } from '#shared/types/media'
defineProps<{ files: Attachment[] }>()
defineEmits<{ loaded: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
async function openPhoto(file: Attachment) { expanded.value = file; await nextTick(); dialog.value?.showModal() }
function closePhoto() { dialog.value?.close(); expanded.value = null }
const expanded = ref<Attachment | null>(null)
const saving = ref<string | null>(null)
const failure = ref('')
const source = (file: Attachment) => `/api/attachments/${file.id}`
const imageFile = (file: Attachment) => /^image\/(jpeg|png|gif|webp|avif)$/.test(file.type)
async function share(file: Attachment) {
  saving.value = file.id; failure.value = ''
  try {
    const response = await fetch(source(file))
    if (!response.ok) throw new Error('File is no longer available. Sign in again if your session expired.')
    const blob = await response.blob()
    const shared = new File([blob], file.name, { type: file.type })
    if (navigator.canShare?.({ files: [shared] })) await navigator.share({ files: [shared], title: file.name })
    else {
      const url = URL.createObjectURL(shared)
      const link = document.createElement('a'); link.href = url; link.download = file.name; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    }
  } catch (error: any) { if (error.name !== 'AbortError') failure.value = error.message || 'Could not save this file. Try Download instead.' }
  finally { saving.value = null }
}
</script>
<template>
  <div class="attachment-list">
    <article v-for="file in files" :key="file.id" class="attachment-card">
      <button v-if="imageFile(file)" class="attachment-image" type="button" :aria-label="`View ${file.name}`" @click="openPhoto(file)"><img :src="source(file)" :alt="file.name" loading="lazy" @load="$emit('loaded')"></button>
      <video v-else-if="file.type.startsWith('video/')" :src="source(file)" controls playsinline preload="metadata" :aria-label="file.name"></video>
      <audio v-else-if="file.type.startsWith('audio/')" :src="source(file)" controls preload="metadata" :aria-label="file.name"></audio>
      <div class="attachment-details"><UiIcon :name="imageFile(file) ? 'image' : 'file'" /><div><strong>{{ file.name }}</strong><small>{{ fileSize(file.size) }}</small></div></div>
      <div class="attachment-actions"><a :href="`${source(file)}?download=1`" :download="file.name"><UiIcon name="download" /> Download</a><button type="button" :disabled="saving === file.id" @click="share(file)"><UiIcon name="share" />{{ saving === file.id ? 'Preparing...' : imageFile(file) ? 'Save / share photo' : 'Share' }}</button></div>
    </article>
    <p v-if="failure" class="form-error" role="alert">{{ failure }}</p>
    <Teleport to="body"><dialog v-if="expanded" ref="dialog" class="photo-lightbox" :aria-label="expanded.name" @click.self="closePhoto" @close="expanded = null"><button class="photo-close" type="button" aria-label="Close image" @click="closePhoto"><UiIcon name="close" /></button><img :src="source(expanded)" :alt="expanded.name"><div class="photo-actions"><button class="primary-button" type="button" @click="share(expanded)"><UiIcon name="share" /> Save / share photo</button><a class="restore-button" :href="`${source(expanded)}?download=1`" :download="expanded.name"><UiIcon name="download" /> Download</a><p>On a phone, use the share menu or touch and hold the image to save it to Photos.</p></div></dialog></Teleport>
  </div>
</template>
