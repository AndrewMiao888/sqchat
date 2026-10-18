<script setup lang="ts">
import { TEXT_EFFECTS, BUBBLE_EFFECTS, SCREEN_EFFECTS, type MessageEffects, type TextEffect, type BubbleEffect, type ScreenEffect } from '#shared/types/media'
import type { ChatMessage } from '#shared/types/chat'
const body = defineModel<string>('body', { required: true })
const effects = defineModel<MessageEffects>('effects', { required: true })
const props = defineProps<{ sender: string }>()
const preview = ref(0)
const textarea = ref<HTMLTextAreaElement | null>(null)
const selection = ref({ start: 0, end: 0 })
const previewMessage = computed<ChatMessage>(() => ({ id: 'edit-preview', sender: props.sender, body: body.value.trim() || 'Message preview', createdAt: new Date().toISOString(), effects: effects.value }))
function captureSelection() { if (textarea.value) selection.value = { start: textarea.value.selectionStart, end: textarea.value.selectionEnd } }
function setTextEffect(effect: TextEffect | '') {
  if (!effect) { effects.value = { ...effects.value, text: [] }; preview.value++; return }
  const leading = body.value.length - body.value.trimStart().length
  const end = body.value.trim().length
  const selected = selection.value.end > selection.value.start
  const span = { effect, start: selected ? Math.max(0, selection.value.start - leading) : 0, end: selected ? Math.min(end, selection.value.end - leading) : end }
  if (span.end <= span.start) return
  effects.value = { ...effects.value, text: [...(effects.value.text || []).filter(item => item.end <= span.start || item.start >= span.end), span].slice(-12) }
  preview.value++
}
function setBubble(value: string) { effects.value = { ...effects.value, bubble: value ? value as BubbleEffect : undefined }; preview.value++ }
function setScreen(value: string) { effects.value = { ...effects.value, screen: value ? value as ScreenEffect : undefined }; preview.value++ }
function clearAll() { effects.value = {}; preview.value++ }
function bodyChanged() { effects.value = { ...effects.value, text: [] } }
</script>
<template>
  <div class="message-edit-fields">
    <textarea ref="textarea" v-model="body" maxlength="1000" rows="3" aria-label="Edit message" @input="bodyChanged" @select="captureSelection" @keyup="captureSelection" @mouseup="captureSelection"></textarea>
    <p class="field-help">Select words before choosing a text effect, or apply it to the whole message. Changing the text clears word effects.</p>
    <div class="edit-effect-grid">
      <label>Text effect<select :value="''" :disabled="!body.trim()" @change="setTextEffect(($event.target as HTMLSelectElement).value as TextEffect); ($event.target as HTMLSelectElement).value = ''"><option value="">Add a text effect…</option><option v-for="effect in TEXT_EFFECTS" :key="effect" :value="effect">{{ effect }}</option></select></label>
      <label>Bubble effect<select :value="effects.bubble || ''" @change="setBubble(($event.target as HTMLSelectElement).value)"><option value="">None</option><option v-for="effect in BUBBLE_EFFECTS" :key="effect" :value="effect">{{ effect === 'invisible' ? 'Invisible ink' : effect }}</option></select></label>
      <label>Screen effect<select :value="effects.screen || ''" @change="setScreen(($event.target as HTMLSelectElement).value)"><option value="">None</option><option v-for="effect in SCREEN_EFFECTS" :key="effect" :value="effect">{{ effect }}</option></select></label>
    </div>
    <div v-if="effects.text?.length" class="edit-text-effects"><span v-for="(span, index) in effects.text" :key="index">{{ span.effect }}: “{{ body.slice(span.start, span.end) }}” <button type="button" class="plain-button" :aria-label="`Remove ${span.effect} text effect`" @click="effects = { ...effects, text: effects.text?.filter((_, i) => i !== index) }; preview++"><UiIcon name="close" /></button></span></div>
    <div class="message-actions"><button class="plain-button" type="button" @click="clearAll">Clear all effects</button><button class="plain-button" type="button" @click="preview++"><UiIcon name="play" /> Preview</button></div>
    <div class="edit-effect-preview"><MessageContent :message="previewMessage" :play="preview" /></div>
  </div>
</template>
