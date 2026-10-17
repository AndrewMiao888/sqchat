import { requireAdmin } from '../../utils/auth'
import { audit, signal, store } from '../../utils/store'

export default defineEventHandler(async event => {
  const { user } = await requireAdmin(event)
  const input = await readBody(event)
  if (input?.length !== 'short' && input?.length !== 'long') {
    throw createError({ statusCode: 400, statusMessage: 'Choose short or long setup codes.' })
  }
  const db = await store()
  await db`INSERT INTO sq_config (key, value) VALUES ('setup_code_length', ${input.length})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
  await audit(user.id, 'setup-code.length.changed', input.length)
  await signal()
  return { length: input.length }
})
