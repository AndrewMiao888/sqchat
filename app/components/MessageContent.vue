<script setup lang="ts">
import type { ChatMessage } from '#shared/types/chat'
import type { TextEffect } from '#shared/types/media'
defineEmits<{ jump: [id: string] }>()
const props = withDefaults(defineProps<{ message: ChatMessage; animated?: boolean; play?: number }>(), { animated: true, play: 0 })
const revealed = ref(false)
const revealAt = ref<{ x: number; y: number } | null>(null)
let hideTimer: ReturnType<typeof setTimeout> | undefined
const invisible = computed(() => props.message.effects?.bubble === 'invisible')
const characters = computed(() => {
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(props.message.body)]
  return segments.map((segment, index) => ({ text: segment.segment, index, effect: [...(props.message.effects?.text || [])].reverse().find(span => segment.index >= span.start && segment.index < span.end)?.effect as TextEffect | undefined }))
})
function reveal() {
  revealed.value = true
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { revealed.value = false; revealAt.value = null }, 12000)
}
function scratch(event: PointerEvent) {
  if (!invisible.value || revealed.value) return
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  revealAt.value = { x: event.clientX - box.left, y: event.clientY - box.top }
  if (event.buttons || event.pointerType === 'touch') reveal()
}
onBeforeUnmount(() => clearTimeout(hideTimer))
</script>
<template>
  <div :key="play" class="message-presentation" :class="[{ 'effect-animated': animated, 'ink-message': invisible, 'ink-revealed': revealed }, message.effects?.bubble ? `bubble-effect-${message.effects.bubble}` : '']">
    <div class="message-bubble effect-bubble" @pointermove="scratch">
      <div :class="{ 'ink-content': invisible }" :aria-hidden="invisible && !revealed ? 'true' : undefined" :inert="invisible && !revealed ? true : undefined">
        <button v-if="message.replyTo" type="button" class="reply-quote" :disabled="message.replyTo.deleted" @click="$emit('jump', message.replyTo.id)"><UiIcon name="reply" /><span><strong>{{ message.replyTo.sender || 'Original message' }}</strong><span>{{ message.replyTo.body }}</span></span></button>
        <p v-if="message.body" class="effect-text" :aria-label="message.body"><span v-if="!message.effects?.text?.length">{{ message.body }}</span><template v-else><span v-for="char in characters" :key="char.index" :class="char.effect && !/\s/.test(char.text) ? ['effect-character', `text-effect-${char.effect}`] : ''" :style="{ '--i': char.index % 24, '--dx': `${((char.index * 37) % 121) - 60}px`, '--dy': `${((char.index * 53) % 101) - 50}px`, '--turn': `${((char.index * 29) % 91) - 45}deg` }" aria-hidden="true">{{ char.text }}</span></template></p>
        <AttachmentList v-if="message.attachments?.length" :files="message.attachments" />
        <LinkPreviews v-if="!invisible || revealed" :text="message.body" />
        <CopyMessageButton v-if="message.body" :text="message.body" />
      </div>
      <button v-if="invisible && !revealed" class="ink-cover" type="button" aria-label="Reveal invisible ink message" @click="reveal" @pointerdown="reveal"><span class="ink-dots"></span><UiIcon name="eye" /><span>Swipe or tap to reveal</span></button>
      <button v-if="invisible && revealed" class="ink-hide plain-button" type="button" @click="revealed = false">Hide again</button>
    </div>
  </div>
</template>
