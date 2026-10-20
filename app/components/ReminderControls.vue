<script setup lang="ts">
import type { ReminderSettings } from '#shared/types/reminders'

const props = defineProps<{ settings?: ReminderSettings }>()
const { api } = useAuth()
const mode = ref<'off' | 'manual' | 'automatic'>('manual')
const delayChoice = ref<'hour' | 'day' | 'custom'>('day')
const customHours = ref(3)
const dirty = ref(false)
const saving = ref(false)
const feedback = ref('')
const failure = ref('')
function sync(settings?: ReminderSettings) {
  if (!settings || dirty.value) return
  mode.value = settings.automaticAfterMinutes !== null ? 'automatic' : settings.manualEnabled ? 'manual' : 'off'
  const hours = (settings.automaticAfterMinutes || 1440) / 60
  delayChoice.value = hours === 1 ? 'hour' : hours === 24 ? 'day' : 'custom'
  customHours.value = hours === 1 || hours === 24 ? 3 : hours
}
watch(() => props.settings, sync, { immediate: true })
async function save() {
  if (saving.value) return
  saving.value = true; feedback.value = ''; failure.value = ''
  const hours = delayChoice.value === 'hour' ? 1 : delayChoice.value === 'day' ? 24 : Number(customHours.value)
  if (mode.value === 'automatic' && (!Number.isInteger(hours) || hours < 1 || hours > 168)) {
    failure.value = 'Choose a whole number of hours from 1 to 168.'; saving.value = false; return
  }
  try {
    await api('/api/admin/reminder-settings', { method: 'PUT', body: {
      manualEnabled: mode.value === 'manual',
      automaticAfterMinutes: mode.value === 'automatic' ? hours * 60 : null
    } })
    dirty.value = false
    feedback.value = 'Reminder choices saved.'
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not save reminder choices.' }
  finally { saving.value = false }
}
</script>

<template>
  <section class="manage-card reminder-controls-card">
    <div class="card-title"><span class="card-icon"><UiIcon name="bell" /></span><div><h2>Unread reminders</h2><p>Choose whether and how to send one extra notification.</p></div></div>
    <form class="settings-form" @submit.prevent="save">
      <label class="reminder-toggle"><input v-model="mode" type="radio" value="off" name="reminder-mode" @change="dirty = true"> No extra notification</label>
      <label class="reminder-toggle"><input v-model="mode" type="radio" value="manual" name="reminder-mode" @change="dirty = true"> I will send it privately to an unread person</label>
      <label class="reminder-toggle"><input v-model="mode" type="radio" value="automatic" name="reminder-mode" @change="dirty = true"> Send it automatically if still unread</label>
      <div v-if="mode === 'automatic'" class="reminder-delay">
        <label>Wait after a message is sent
          <select v-model="delayChoice" @change="dirty = true"><option value="hour">1 hour</option><option value="day">24 hours</option><option value="custom">Custom</option></select>
        </label>
        <label v-if="delayChoice === 'custom'">Custom hours <input v-model.number="customHours" type="number" min="1" max="168" step="1" required @input="dirty = true"></label>
        <p class="field-help">The app checks every 5 minutes while someone has it open and once daily otherwise. The delay is approximate when nobody is online.</p>
      </div>
      <p class="field-help">The choice applies to everyone. A person receives at most one extra notification per message. Only you can see whom you reminded. Automatic timing starts with messages sent after you save it.</p>
      <button class="primary-button" type="submit" :disabled="saving || !dirty">{{ saving ? 'Saving...' : 'Save reminder choices' }}</button>
      <p v-if="feedback" class="settings-feedback-success" role="status">{{ feedback }}</p>
      <p v-if="failure" class="settings-feedback-error" role="alert">{{ failure }}</p>
    </form>
  </section>
</template>
