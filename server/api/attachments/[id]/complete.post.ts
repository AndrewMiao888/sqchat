import { requireAuth } from '../../../utils/auth'
import { accessibleAttachment, verifyUpload, removeAttachment } from '../../../utils/attachments'
import { store } from '../../../utils/store'
export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  const file = await accessibleAttachment(user, getRouterParam(event, 'id') || '', true)
  if (file.status === 'ready') return { id: file.id, name: file.name, type: file.content_type, size: Number(file.size) }
  if (file.status !== 'pending') throw createError({ statusCode: 409, statusMessage: 'This file has already been sent.' })
  try { await verifyUpload(file) } catch (error) { await removeAttachment(file).catch(() => {}); throw error }
  const db = await store()
  const changed = await db`UPDATE sq_attachments SET status = 'ready' WHERE id = ${file.id} AND status = 'pending' RETURNING id`
  if (!changed.length) throw createError({ statusCode: 409, statusMessage: 'This upload was removed before it finished.' })
  return { id: file.id, name: file.name, type: file.content_type, size: Number(file.size) }
})
