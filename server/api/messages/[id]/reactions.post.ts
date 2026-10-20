import { requireAuth, rateLimit } from '../../../utils/auth'
import { findThread } from '../../../utils/chat'
import { store } from '../../../utils/store'

const ALLOWED_REACTIONS = new Set(['👍', '❤️', '😂', '😮', '😢', '🎉'])

export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  const input = await readBody(event)
  const id = getRouterParam(event, 'id') || ''
  const conversation = typeof input?.conversation === 'string' && input.conversation ? input.conversation : null
  if (id.length > 100 || !ALLOWED_REACTIONS.has(input?.emoji)) {
    throw createError({ statusCode: 400, statusMessage: 'Choose one of the available reactions.' })
  }
  const thread = conversation ? await findThread(user, conversation, true) : null
  if (!thread && user.privateOnly) throw createError({ statusCode: 403, statusMessage: 'This account uses private conversations only.' })
  await rateLimit(`reaction:${user.id}`, 60, 60)
  const db = await store()
  const message = thread
    ? await db`SELECT id FROM sq_private_messages WHERE id = ${id} AND thread_id = ${thread.id}`
    : await db`SELECT id FROM chat_messages WHERE id = ${id}`
  if (!message.length) throw createError({ statusCode: 404, statusMessage: 'Message not found.' })
  const existing = await db`SELECT message_id FROM sq_message_reactions WHERE message_id = ${id} AND user_id = ${user.id} AND emoji = ${input.emoji}`
  if (existing.length) {
    await db`DELETE FROM sq_message_reactions WHERE message_id = ${id} AND user_id = ${user.id} AND emoji = ${input.emoji}`
  } else {
    await db`INSERT INTO sq_message_reactions (message_id, user_id, emoji) VALUES (${id}, ${user.id}, ${input.emoji}) ON CONFLICT DO NOTHING`
  }
  const payload = thread
    ? { conversation: thread.id, users: thread.members.map(member => member.id), reaction: true }
    : { conversation: null, reaction: true }
  await db`SELECT pg_notify('sqchat_changes', ${JSON.stringify(payload)})`
  return { ok: true, removed: !!existing.length }
})
