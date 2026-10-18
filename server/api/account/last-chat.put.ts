import { requireAdmin } from '../../utils/auth'
import { store } from '../../utils/store'

export default defineEventHandler(async event => {
  const { user } = await requireAdmin(event)
  const input = await readBody(event)
  if (typeof input?.chat !== 'string' || input.chat.length > 100) throw createError({ statusCode: 400, statusMessage: 'Choose a conversation.' })
  const db = await store()
  if (input.chat) {
    const existing = await db`SELECT id FROM sq_threads WHERE id = ${input.chat}`
    if (!existing.length) throw createError({ statusCode: 404, statusMessage: 'Conversation no longer exists.' })
  }
  await db`UPDATE sq_users SET last_chat = ${input.chat} WHERE id = ${user.id}`
  return { ok: true }
})
