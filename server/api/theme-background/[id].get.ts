import { get } from '@vercel/blob'
import { requireAuth } from '../../utils/auth'
import { findThread } from '../../utils/chat'
import { store } from '../../utils/store'

export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id') || ''
  const db = await store()
  const rows = await db`SELECT t.conversation_key, a.blob_path, a.content_type FROM sq_conversation_themes t
    JOIN sq_attachments a ON t.data->>'backgroundImageId' = a.id
    WHERE a.id = ${id} AND a.status = 'theme' AND a.purpose = 'theme'`
  const file = rows[0]
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.content_type)) throw createError({ statusCode: 404, statusMessage: 'Background picture not found.' })
  if (file.conversation_key === 'shared') {
    if (user.privateOnly) throw createError({ statusCode: 404, statusMessage: 'Background picture not found.' })
  } else await findThread(user, file.conversation_key)
  const result = await get(file.blob_path, { access: 'private' })
  if (!result || result.statusCode !== 200) throw createError({ statusCode: 404, statusMessage: 'Background picture not found.' })
  setHeaders(event, { 'Content-Type': file.content_type, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" })
  return sendStream(event, result.stream)
})
