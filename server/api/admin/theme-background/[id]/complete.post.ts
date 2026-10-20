import { requireCmsEditor } from '../../../../utils/auth'
import { accessibleAttachment, verifyUpload, removeAttachment } from '../../../../utils/attachments'
import { store } from '../../../../utils/store'

export default defineEventHandler(async event => {
  const { user } = await requireCmsEditor(event)
  const file = await accessibleAttachment(user, getRouterParam(event, 'id') || '', true)
  if (file.purpose !== 'theme') throw createError({ statusCode: 404, statusMessage: 'Picture upload not found.' })
  if (file.status === 'theme') return { id: file.id }
  if (file.status !== 'pending') throw createError({ statusCode: 409, statusMessage: 'This picture upload is no longer available.' })
  try { await verifyUpload(file) } catch (error) { await removeAttachment(file).catch(() => {}); throw error }
  const db = await store()
  const changed = await db`UPDATE sq_attachments SET status = 'theme' WHERE id = ${file.id} AND status = 'pending' AND purpose = 'theme' RETURNING id`
  if (!changed.length) throw createError({ statusCode: 409, statusMessage: 'This picture was removed before it finished.' })
  return { id: file.id }
})
