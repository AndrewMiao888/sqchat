import { requireAdmin } from '../../../../utils/auth'
import { store, audit, signal } from '../../../../utils/store'
import { findThread } from '../../../../utils/chat'
export default defineEventHandler(async event => {
  const { user } = await requireAdmin(event)
  const id = getRouterParam(event, 'id') || ''
  const member = getRouterParam(event, 'userId') || ''
  const thread = await findThread(user, id)
  const db = await store()
  const removed = await db`DELETE FROM sq_thread_members WHERE thread_id = ${id} AND user_id = ${member} RETURNING user_id`
  if (!removed.length) throw createError({ statusCode: 404, statusMessage: 'This person is no longer in the conversation.' })
  await audit(user.id, 'conversation.member-removed', id)
  await signal(thread.members.map(person => person.id))
  return { ok: true }
})
