import { requireAdmin } from '../../utils/auth'
import { audit, signal } from '../../utils/store'
import { saveReminderSettings } from '../../utils/reminderSettings'
import type { ReminderSettings } from '#shared/types/reminders'

export default defineEventHandler(async event => {
  const { user } = await requireAdmin(event)
  const input = await readBody(event)
  if (typeof input?.manualEnabled !== 'boolean'
    || (input.manualEnabled && input.automaticAfterMinutes !== null)
    || (input.automaticAfterMinutes !== null && (!Number.isInteger(input.automaticAfterMinutes)
      || input.automaticAfterMinutes < 60 || input.automaticAfterMinutes > 10080
      || input.automaticAfterMinutes % 60 !== 0))) {
    throw createError({ statusCode: 400, statusMessage: 'Choose valid reminder settings.' })
  }
  const settings: ReminderSettings = { manualEnabled: input.manualEnabled, automaticAfterMinutes: input.automaticAfterMinutes }
  await saveReminderSettings(settings)
  await audit(user.id, 'reminders.settings')
  await signal([user.id])
  return settings
})
