import { deleteMessage } from '../../utils/chat'
import { requireAdmin } from '../../utils/auth'
import { audit } from '../../utils/store'

export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)
  const id = getRouterParam(event, 'id') || ''
  if (!await deleteMessage(id)) throw createError({ statusCode: 404, statusMessage: 'Message not found.' })
  await audit(user.id, 'message.deleted', id)
  return { ok: true }
})
