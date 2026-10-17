import { requireAuth } from '../../utils/auth'
import { accessibleAttachment, removeAttachment } from '../../utils/attachments'
export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  const file = await accessibleAttachment(user, getRouterParam(event, 'id') || '', true)
  if (file.status === 'attached') throw createError({ statusCode: 403, statusMessage: 'Ask Andrew to delete the message containing this file.' })
  await removeAttachment(file)
  return { ok: true }
})
