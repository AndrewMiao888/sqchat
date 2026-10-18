import { timingSafeEqual } from 'node:crypto'
import { purgeExpiredSetupCodes } from '../../utils/setupCodes'

export default defineEventHandler(async event => {
  const expected = process.env.CRON_SECRET || ''
  const actual = getHeader(event, 'authorization') || ''
  const token = `Bearer ${expected}`
  if (expected.length < 16 || actual.length !== token.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(token))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized.' })
  }
  await purgeExpiredSetupCodes()
  return { ok: true }
})
