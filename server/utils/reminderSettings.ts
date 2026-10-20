import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from '#shared/types/reminders'
import { store } from './store'

interface StoredReminderSettings extends ReminderSettings {
  automaticSince: string | null
}

export async function getStoredReminderSettings(): Promise<StoredReminderSettings> {
  const db = await store()
  const rows = await db`SELECT value FROM sq_config WHERE key = 'reminder_settings'`
  if (!rows.length) return { ...DEFAULT_REMINDER_SETTINGS, automaticSince: null }
  try {
    const parsed = JSON.parse(rows[0]!.value)
    const automaticAfterMinutes = Number.isInteger(parsed.automaticAfterMinutes) && parsed.automaticAfterMinutes >= 60 && parsed.automaticAfterMinutes <= 10080
      ? parsed.automaticAfterMinutes : null
    return {
      manualEnabled: parsed.manualEnabled === true,
      automaticAfterMinutes,
      automaticSince: typeof parsed.automaticSince === 'string' && !Number.isNaN(Date.parse(parsed.automaticSince))
        ? parsed.automaticSince : null
    }
  } catch { return { ...DEFAULT_REMINDER_SETTINGS, automaticSince: null } }
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  const { manualEnabled, automaticAfterMinutes } = await getStoredReminderSettings()
  return { manualEnabled, automaticAfterMinutes }
}

export async function saveReminderSettings(settings: ReminderSettings) {
  const db = await store()
  const previous = await getStoredReminderSettings()
  const stored: StoredReminderSettings = { ...settings,
    automaticSince: settings.automaticAfterMinutes === null ? null
      : settings.automaticAfterMinutes === previous.automaticAfterMinutes && previous.automaticSince
        ? previous.automaticSince : new Date().toISOString() }
  await db`INSERT INTO sq_config (key, value) VALUES ('reminder_settings', ${JSON.stringify(stored)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
}
