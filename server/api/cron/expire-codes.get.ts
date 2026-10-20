import { timingSafeEqual } from 'node:crypto'
import { purgeExpiredSetupCodes } from '../../utils/setupCodes'
import { dispatchDueReminders } from '../../utils/automaticReminders'

export default defineEventHandler(async event => {
  const expected = process.env.CRON_SECRET || ''
  const actual = getHeader(event, 'authorization') || ''
  const token = `Bearer ${expected}`
  if (expected.length < 16 || actual.length !== token.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(token))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized.' })
  }
  await purgeExpiredSetupCodes()
  const remindersSent = await dispatchDueReminders()
  return { ok: true, remindersSent }
})
