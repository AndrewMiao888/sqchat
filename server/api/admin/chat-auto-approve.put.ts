import { requireAdmin } from '../../utils/auth'
import { store, audit, signal } from '../../utils/store'

export default defineEventHandler(async event => {
  const { user } = await requireAdmin(event)
  const input = await readBody(event)
  if (typeof input?.id !== 'string' || typeof input?.allow !== 'boolean') throw createError({ statusCode: 400, statusMessage: 'Choose a person and permission.' })
  const db = await store()
  const rows = await db`UPDATE sq_users SET chat_auto_approve = ${input.allow}
    WHERE id = ${input.id} AND status = 'active' AND role = 'member' RETURNING id`
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Active member not found.' })
  await audit(user.id, input.allow ? 'conversation.auto-approved' : 'conversation.approval-required', input.id)
  await signal()
  return { ok: true }
})
