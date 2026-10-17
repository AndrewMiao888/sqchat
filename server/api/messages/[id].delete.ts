import { deleteMessage } from '../../utils/chat'
import { requireAuth } from '../../utils/auth'
import { audit } from '../../utils/store'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id') || ''
  if (!await deleteMessage(id, user)) throw createError({ statusCode: 404, statusMessage: 'Message not found or you cannot delete it.' })
  await audit(user.id, 'message.deleted', id)
  return { ok: true }
})
