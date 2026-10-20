import { requireAuth, rateLimit } from '../utils/auth'
import { findThread } from '../utils/chat'
import { store } from '../utils/store'

export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  const input = await readBody(event)
  if ((input?.conversation !== null && (typeof input?.conversation !== 'string' || input.conversation.length > 100))
    || !Array.isArray(input?.ids) || input.ids.length < 1 || input.ids.length > 100
    || input.ids.some((id: unknown) => typeof id !== 'string' || id.length < 1 || id.length > 100)) {
    throw createError({ statusCode: 400, statusMessage: 'Choose visible messages to mark as read.' })
  }
  const conversation: string | null = input.conversation || null
  const ids = [...new Set<string>(input.ids)]
  const thread = conversation ? await findThread(user, conversation) : null
  if (!thread && user.privateOnly) throw createError({ statusCode: 403, statusMessage: 'This account uses private conversations only.' })
  await rateLimit(`reads:${user.id}`, 45, 60)
  const db = await store()
  const rows = thread
    ? await db`INSERT INTO sq_message_reads (message_id, user_id)
        SELECT id, ${user.id} FROM sq_private_messages WHERE thread_id = ${thread.id} AND id = ANY(${ids}::text[])
        ON CONFLICT DO NOTHING RETURNING message_id`
    : await db`INSERT INTO sq_message_reads (message_id, user_id)
        SELECT id, ${user.id} FROM chat_messages WHERE id = ANY(${ids}::text[])
        ON CONFLICT DO NOTHING RETURNING message_id`
  if (rows.length) {
    const payload = thread
      ? { conversation: thread.id, users: thread.members.map(member => member.id), receipt: true }
      : { conversation: null, receipt: true }
    await db`SELECT pg_notify('sqchat_changes', ${JSON.stringify(payload)})`
  }
  return { readIds: rows.map(row => row.message_id) }
})
