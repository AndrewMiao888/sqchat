import { randomUUID } from 'node:crypto'
import { requireAuth, rateLimit } from '../utils/auth'
import { store, audit } from '../utils/store'
import { notifyThread, cleanText } from '../utils/chat'
export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  await rateLimit(`new-chat:${user.id}`, 20, 600)
  const input = await readBody(event)
  const ids = [...new Set<string>([user.id, ...(Array.isArray(input?.userIds) ? input.userIds.filter((id: unknown) => typeof id === 'string') : [])])]
  if (ids.length < 2 || ids.length > 23) throw createError({ statusCode: 400, statusMessage: 'Choose at least one other person, up to 23 people per chat.' })
  const title = input?.title ? cleanText(input.title, 70) : ''
  if (title === null) throw createError({ statusCode: 400, statusMessage: 'Keep the conversation name under 70 characters.' })
  const db = await store()
  const users = await db`SELECT id FROM sq_users WHERE id = ANY(${ids}::text[]) AND status = 'active'`
  if (users.length !== ids.length) throw createError({ statusCode: 400, statusMessage: 'Choose active members only.' })
  // Reuse an existing direct conversation. Group conversations can have their own names.
  if (ids.length === 2) {
    const existing = await db`SELECT thread_id AS id FROM sq_thread_members GROUP BY thread_id
      HAVING COUNT(*) = 2 AND bool_and(user_id = ANY(${ids}::text[])) LIMIT 1`
    if (existing[0]) return { id: existing[0].id }
  }
  const id = randomUUID()
  await db.transaction([
    db`INSERT INTO sq_threads (id, title, created_by) VALUES (${id}, ${title}, ${user.id})`,
    db`INSERT INTO sq_thread_members (thread_id, user_id) SELECT ${id}, unnest(${ids}::text[])`
  ])
  await audit(user.id, 'conversation.created', id)
  await notifyThread(id)
  return { id }
})
