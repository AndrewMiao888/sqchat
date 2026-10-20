import { requireAuth, rateLimit } from '../../utils/auth'
import { dispatchDueReminders } from '../../utils/automaticReminders'

export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  await rateLimit(`automatic-reminder-check:${user.id}`, 1, 60)
  return { sent: await dispatchDueReminders() }
})
