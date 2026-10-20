export interface ReminderSettings {
  manualEnabled: boolean
  automaticAfterMinutes: number | null
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  manualEnabled: true,
  automaticAfterMinutes: null
}
