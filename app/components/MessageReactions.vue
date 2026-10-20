<script setup lang="ts">
import type { ChatMessage } from '#shared/types/chat'
const props = defineProps<{ message: ChatMessage; conversation: string; enabled: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { api } = useAuth()
const options = ['👍', '❤️', '😂', '😮', '😢', '🎉']
const pickerOpen = ref(false)
const busy = ref('')
const failure = ref('')
async function react(emoji: string) {
  if (!props.enabled || busy.value) return
  busy.value = emoji; failure.value = ''
  try {
    await api(`/api/messages/${encodeURIComponent(props.message.id)}/reactions`, {
      method: 'POST', body: { emoji, conversation: props.conversation || null }
    })
    pickerOpen.value = false
    emit('changed')
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not save this reaction.' }
  finally { busy.value = '' }
}
</script>

<template>
  <div v-if="message.reactions?.length || enabled" class="message-reactions" role="group" :aria-label="`Reactions to ${message.sender}'s message`">
    <button v-for="reaction in message.reactions" :key="reaction.emoji" class="reaction-chip" :class="{ selected: reaction.reactedByMe }" :disabled="!enabled || !!busy" :title="reaction.users.map(person => person.name).join(', ')" :aria-label="`${reaction.emoji}, ${reaction.count} ${reaction.count === 1 ? 'reaction' : 'reactions'}${reaction.reactedByMe ? ', yours' : ''}`" @click="react(reaction.emoji)">
      <span aria-hidden="true">{{ reaction.emoji }}</span><span>{{ reaction.count }}</span>
    </button>
    <div v-if="enabled" class="reaction-picker-wrap">
      <button class="reaction-add" type="button" :aria-expanded="pickerOpen" aria-label="Add a reaction" @click="pickerOpen = !pickerOpen">＋</button>
      <div v-if="pickerOpen" class="reaction-picker" role="group" aria-label="Choose a reaction">
        <button v-for="emoji in options" :key="emoji" type="button" :disabled="!!busy" :aria-label="`React with ${emoji}`" @click="react(emoji)">{{ emoji }}</button>
      </div>
    </div>
    <span v-if="failure" class="reaction-error" role="alert">{{ failure }}</span>
  </div>
</template>
