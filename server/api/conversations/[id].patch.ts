import { requireAuth } from '../../utils/auth'
import { cleanText, findThread, notifyThread } from '../../utils/chat'
import { audit, store } from '../../utils/store'

export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id') || ''
  const input = await readBody(event)
  const title = input?.title ? cleanText(input.title, 70) : ''
  if (title === null) throw createError({ statusCode: 400, statusMessage: 'Keep the conversation name under 70 characters.' })
  const thread = await findThread(user, id)
  if (user.role !== 'admin' && !thread.members.some(member => member.id === user.id)) throw createError({ statusCode: 403, statusMessage: 'Only participants and Andrew can rename a conversation.' })
  const db = await store()
  const rows = await db`UPDATE sq_threads SET title = ${title} WHERE id = ${id} RETURNING id`
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'Conversation not found.' })
  await audit(user.id, 'conversation.renamed', id)
  await notifyThread(id)
  return { id, title }
})
