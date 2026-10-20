<script setup lang="ts">
import type { ReminderSettings } from '#shared/types/reminders'

const props = defineProps<{ settings?: ReminderSettings }>()
const { api } = useAuth()
const manualEnabled = ref(true)
const automaticEnabled = ref(false)
const delayChoice = ref<'hour' | 'day' | 'custom'>('day')
const customHours = ref(3)
const dirty = ref(false)
const saving = ref(false)
const feedback = ref('')
const failure = ref('')
function sync(settings?: ReminderSettings) {
  if (!settings || dirty.value) return
  manualEnabled.value = settings.manualEnabled
  automaticEnabled.value = settings.automaticAfterMinutes !== null
  const hours = (settings.automaticAfterMinutes || 1440) / 60
  delayChoice.value = hours === 1 ? 'hour' : hours === 24 ? 'day' : 'custom'
  customHours.value = hours === 1 || hours === 24 ? 3 : hours
}
watch(() => props.settings, sync, { immediate: true })
async function save() {
  if (saving.value) return
  saving.value = true; feedback.value = ''; failure.value = ''
  const hours = delayChoice.value === 'hour' ? 1 : delayChoice.value === 'day' ? 24 : Number(customHours.value)
  if (automaticEnabled.value && (!Number.isInteger(hours) || hours < 1 || hours > 168)) {
    failure.value = 'Choose a whole number of hours from 1 to 168.'; saving.value = false; return
  }
  try {
    await api('/api/admin/reminder-settings', { method: 'PUT', body: {
      manualEnabled: manualEnabled.value,
      automaticAfterMinutes: automaticEnabled.value ? hours * 60 : null
    } })
    dirty.value = false
    feedback.value = 'Reminder choices saved.'
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not save reminder choices.' }
  finally { saving.value = false }
}
</script>

<template>
  <section class="manage-card reminder-controls-card">
    <div class="card-title"><span class="card-icon"><UiIcon name="bell" /></span><div><h2>Unread reminders</h2><p>Choose which ways to send one extra notification.</p></div></div>
    <form class="settings-form" @submit.prevent="save">
      <label class="reminder-toggle"><input v-model="manualEnabled" type="checkbox" @change="dirty = true"> Let me send a reminder privately to an unread person</label>
      <label class="reminder-toggle"><input v-model="automaticEnabled" type="checkbox" @change="dirty = true"> Send an automatic reminder if still unread</label>
      <div v-if="automaticEnabled" class="reminder-delay">
        <label>Wait after a message is sent
          <select v-model="delayChoice" @change="dirty = true"><option value="hour">1 hour</option><option value="day">24 hours</option><option value="custom">Custom</option></select>
        </label>
        <label v-if="delayChoice === 'custom'">Custom hours <input v-model.number="customHours" type="number" min="1" max="168" step="1" required @input="dirty = true"></label>
        <p class="field-help">The app checks every 5 minutes while someone has it open and once daily otherwise. The delay is approximate when nobody is online.</p>
      </div>
      <p class="field-help">You can turn either option on or off. If both are on, the first reminder sent uses up the one extra notification for that person and message. Only you can see whom you reminded. Automatic timing starts with messages sent after you save it.</p>
      <button class="primary-button" type="submit" :disabled="saving || !dirty">{{ saving ? 'Saving...' : 'Save reminder choices' }}</button>
      <p v-if="feedback" class="settings-feedback-success" role="status">{{ feedback }}</p>
      <p v-if="failure" class="settings-feedback-error" role="alert">{{ failure }}</p>
    </form>
  </section>
</template>
