import { randomUUID } from 'node:crypto'
import { requireAdmin, rateLimit } from '../../../utils/auth'
import { store, audit, signal } from '../../../utils/store'
import { notifyThread } from '../../../utils/chat'

export default defineEventHandler(async event => {
  const { user } = await requireAdmin(event)
  await rateLimit(`chat-approval:${user.id}`, 40, 60)
  const id = getRouterParam(event, 'id') || ''
  const input = await readBody(event)
  if (!['approve', 'decline'].includes(input?.decision)) throw createError({ statusCode: 400, statusMessage: 'Approve or decline this request.' })
  const db = await store()
  const request = (await db`SELECT * FROM sq_chat_requests WHERE id = ${id} AND status = 'pending'`)[0]
  if (!request) throw createError({ statusCode: 404, statusMessage: 'This request is no longer pending.' })
  if (input.decision === 'approve') {
    const ids = request.user_ids as string[]
    const active = await db`SELECT id FROM sq_users WHERE id = ANY(${ids}::text[]) AND status = 'active'`
    if (active.length !== ids.length) throw createError({ statusCode: 409, statusMessage: 'A requested person is no longer active. Decline this request.' })
    if (request.kind === 'add') {
      const thread = await db`SELECT id FROM sq_threads WHERE id = ${request.thread_id}`
      if (!thread.length) throw createError({ statusCode: 409, statusMessage: 'This chat no longer exists. Decline this request.' })
      const current = await db`SELECT COUNT(*)::int AS count FROM sq_thread_members WHERE thread_id = ${request.thread_id}`
      if ((current[0]?.count || 0) + ids.length > 24) throw createError({ statusCode: 409, statusMessage: 'This chat would exceed 24 people. Decline this request.' })
    }
  }
  const claimed = await db`UPDATE sq_chat_requests SET status = ${input.decision === 'approve' ? 'approved' : 'declined'}, decided_at = NOW()
    WHERE id = ${id} AND status = 'pending' RETURNING *`
  if (!claimed.length) throw createError({ statusCode: 409, statusMessage: 'This request has already been decided.' })
  let threadId: string | null = null
  try {
    if (input.decision === 'approve') {
      const ids = request.user_ids as string[]
      if (request.kind === 'create') {
        threadId = randomUUID()
        await db.transaction([
          db`INSERT INTO sq_threads (id, title, created_by) VALUES (${threadId}, ${request.title}, ${request.requester_id})`,
          db`INSERT INTO sq_thread_members (thread_id, user_id) SELECT ${threadId}, unnest(${ids}::text[])`
        ])
      } else {
        threadId = request.thread_id
        await db`INSERT INTO sq_thread_members (thread_id, user_id) SELECT ${threadId}, unnest(${ids}::text[]) ON CONFLICT DO NOTHING`
      }
    }
  } catch (error) {
    await db`UPDATE sq_chat_requests SET status = 'pending', decided_at = NULL WHERE id = ${id}`
    throw error
  }
  await audit(user.id, `conversation.request-${input.decision}`, id)
  await signal()
  if (threadId) await notifyThread(threadId)
  return { ok: true, threadId }
})
