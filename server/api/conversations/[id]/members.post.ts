import { requireAuth } from '../../../utils/auth'
import { store, audit } from '../../../utils/store'
import { findThread, notifyThread } from '../../../utils/chat'
export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
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
  await db`INSERT INTO sq_thread_members (thread_id, user_id) SELECT ${id}, unnest(${ids}::text[]) ON CONFLICT DO NOTHING`
  await audit(user.id, 'conversation.members-added', id)
  await notifyThread(id)
  return { ok: true }
})
