import { requireAuth, rateLimit } from '../../../utils/auth'
import { store, audit, signal } from '../../../utils/store'
import { findThread, notifyThread } from '../../../utils/chat'
import { randomUUID } from 'node:crypto'
import { pushChatRequest } from '../../../utils/push'
export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  await rateLimit(`chat-members:${user.id}`, 20, 600)
  const id = getRouterParam(event, 'id') || ''
  const thread = await findThread(user, id)
  if (user.role !== 'admin' && !thread.members.some(member => member.id === user.id)) throw createError({ statusCode: 403, statusMessage: 'Only participants and Andrew can add people to a conversation.' })
  const input = await readBody(event)
  const ids = [...new Set<string>(Array.isArray(input?.userIds) ? input.userIds.filter((item: unknown) => typeof item === 'string') : [])]
  if (!ids.length || ids.length > 24) throw createError({ statusCode: 400, statusMessage: 'Choose the people to add.' })
  const db = await store()
  const active = await db`SELECT id FROM sq_users WHERE id = ANY(${ids}::text[]) AND status = 'active'`
  if (active.length !== ids.length) throw createError({ statusCode: 400, statusMessage: 'Choose active members only.' })
  const combined = new Set([...thread.members.map(member => member.id), ...ids])
  if (combined.size > 24) throw createError({ statusCode: 400, statusMessage: 'A conversation can have up to 24 people.' })
  if (user.role !== 'admin' && !(await db`SELECT chat_auto_approve FROM sq_users WHERE id = ${user.id}`)[0]?.chat_auto_approve) {
    const requestId = randomUUID()
    await db`INSERT INTO sq_chat_requests (id, requester_id, kind, thread_id, user_ids)
      VALUES (${requestId}, ${user.id}, 'add', ${id}, ${JSON.stringify(ids)}::jsonb)`
    await audit(user.id, 'conversation.members-requested', requestId)
    await signal()
    await pushChatRequest(user.name, `add ${ids.length} ${ids.length === 1 ? 'person' : 'people'} to a chat`).catch(() => console.warn('Chat request push unavailable'))
    return { pending: true, requestId }
  }
  await db`INSERT INTO sq_thread_members (thread_id, user_id) SELECT ${id}, unnest(${ids}::text[]) ON CONFLICT DO NOTHING`
  await audit(user.id, 'conversation.members-added', id)
  await notifyThread(id)
  return { ok: true }
})
