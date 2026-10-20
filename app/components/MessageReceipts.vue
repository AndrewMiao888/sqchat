<script setup lang="ts">
import type { ChatMessage } from '#shared/types/chat'

defineProps<{ message: ChatMessage; canRemind?: boolean; currentUserId?: string; reminding?: string }>()
defineEmits<{ remind: [userId: string] }>()
</script>

<template>
  <details v-if="message.readBy?.length || message.unreadBy?.length" class="message-receipts">
    <summary>{{ message.readBy?.length || 0 }} read · {{ message.unreadBy?.length || 0 }} unread</summary>
    <div class="message-receipt-list">
      <p v-if="message.readBy?.length"><strong>Read:</strong> {{ message.readBy.map(person => person.name).join(', ') }}</p>
      <div v-if="message.unreadBy?.length" class="message-unread-people"><strong>Not read:</strong>
        <span v-for="person in message.unreadBy" :key="person.id" class="message-unread-person">{{ person.name }}
          <span v-if="person.remindedAt" class="reminder-sent">reminded</span>
          <button v-else-if="canRemind && person.id !== currentUserId && person.id !== reminding" class="plain-button reminder-button" type="button" :disabled="!!reminding" @click="$emit('remind', person.id)">Remind once</button>
          <span v-else-if="person.id === reminding">Sending...</span>
        </span>
      </div>
    </div>
  </details>
</template>
