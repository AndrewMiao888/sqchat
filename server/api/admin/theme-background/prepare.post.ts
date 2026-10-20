import { randomUUID } from 'node:crypto'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'
import { requireCmsEditor, rateLimit } from '../../../utils/auth'
import { store } from '../../../utils/store'
import { findThread } from '../../../utils/chat'
import { cleanAbandonedUploads } from '../../../utils/attachments'

const IMAGE_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export default defineEventHandler(async event => {
  const { user } = await requireCmsEditor(event)
  await rateLimit(`theme-upload:${user.id}`, 10, 3600)
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw createError({ statusCode: 503, statusMessage: 'Picture backgrounds are being configured. Please try again shortly.' })
  const input = await readBody(event)
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw createError({ statusCode: 400, statusMessage: 'Choose a picture to upload.' })
  const name = typeof input?.name === 'string' ? input.name.normalize('NFKC').replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 120).trim() : ''
  const extension = name.split('.').at(-1)?.toLowerCase() || ''
  const contentType = IMAGE_TYPES[extension]
  if (!name || !contentType) throw createError({ statusCode: 400, statusMessage: 'Choose a JPEG, PNG or WebP picture.' })
  if (!Number.isInteger(input.size) || input.size < 1 || input.size > 5 * 1024 * 1024) throw createError({ statusCode: 400, statusMessage: 'Background pictures must be 5 MB or smaller.' })
  const conversation = typeof input.conversation === 'string' && input.conversation ? input.conversation : null
  if (conversation) await findThread(user, conversation)
  else if (user.privateOnly) throw createError({ statusCode: 403, statusMessage: 'This account uses private conversations only.' })
  await cleanAbandonedUploads()
  const db = await store()
  const id = randomUUID()
  const path = `theme/${user.id}/${id}.${extension}`
  const results = await db.transaction([
    db`SELECT pg_advisory_xact_lock(84372502)`,
    db`INSERT INTO sq_attachments (id, owner_id, thread_id, name, content_type, size, blob_path, purpose)
      SELECT ${id}, ${user.id}, ${conversation}, ${name}, ${contentType}, ${input.size}, ${path}, 'theme'
      WHERE COALESCE((SELECT SUM(size) FROM sq_attachments WHERE status NOT IN ('deleted','purged') OR created_at > NOW() - INTERVAL '20 minutes'),0) + ${input.size} <= 524288000
      RETURNING id`
  ])
  if (!results[1]?.length) throw createError({ statusCode: 409, statusMessage: 'Picture storage is full. Remove an old picture or ask Andrew to free space.' })
  const token = await generateClientTokenFromReadWriteToken({ pathname: path, maximumSizeInBytes: input.size, allowedContentTypes: [contentType], validUntil: Date.now() + 15 * 60000, addRandomSuffix: false, allowOverwrite: false })
  return { id, pathname: path, token, contentType, name, size: input.size }
})
