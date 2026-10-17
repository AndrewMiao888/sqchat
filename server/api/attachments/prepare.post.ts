import { randomUUID } from 'node:crypto'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'
import { requireAuth, rateLimit } from '../../utils/auth'
import { store } from '../../utils/store'
import { findThread } from '../../utils/chat'
import { cleanAbandonedUploads } from '../../utils/attachments'
import { FILE_TYPES, MAX_FILE_SIZE } from '#shared/types/media'
export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  await rateLimit(`upload:${user.id}`, 30, 3600)
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw createError({ statusCode: 503, statusMessage: 'Uploads are being configured. Please try again shortly.' })
  const input = await readBody(event)
  const name = typeof input?.name === 'string' ? input.name.normalize('NFKC').replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 120).trim() : ''
  const extension = name.split('.').at(-1)?.toLowerCase() || ''
  const contentType = FILE_TYPES[extension]
  if (!name || !contentType) throw createError({ statusCode: 400, statusMessage: 'Choose a photo, video, audio file, PDF, document, text file, or ZIP.' })
  if (!Number.isInteger(input.size) || input.size < 1 || input.size > MAX_FILE_SIZE) throw createError({ statusCode: 400, statusMessage: 'Each file must be between 1 byte and 20 MB.' })
  const conversation = typeof input.conversation === 'string' && input.conversation ? input.conversation : null
  if (conversation) await findThread(user, conversation, true)
  else if (user.privateOnly) throw createError({ statusCode: 403, statusMessage: 'This account uses private conversations only.' })
  await cleanAbandonedUploads()
  const db = await store()
  const id = randomUUID()
  const path = `chat/${user.id}/${id}.${extension}`
  const results = await db.transaction([
    db`SELECT pg_advisory_xact_lock(84372502)`,
    db`INSERT INTO sq_attachments (id, owner_id, thread_id, name, content_type, size, blob_path)
      SELECT ${id}, ${user.id}, ${conversation}, ${name}, ${contentType}, ${input.size}, ${path}
      WHERE COALESCE((SELECT SUM(size) FROM sq_attachments WHERE status NOT IN ('deleted','purged') OR created_at > NOW() - INTERVAL '20 minutes'),0) + ${input.size} <= 524288000
        AND (SELECT COUNT(*) FROM sq_attachments WHERE owner_id = ${user.id} AND status IN ('pending','ready')) < 12
      RETURNING id`
  ])
  if (!results[1]?.length) throw createError({ statusCode: 409, statusMessage: 'Upload space is full or you have too many unsent files. Remove an unsent attachment or ask Andrew to free space.' })
  const clientToken = await generateClientTokenFromReadWriteToken({ pathname: path, maximumSizeInBytes: input.size, allowedContentTypes: [contentType], validUntil: Date.now() + 15 * 60000, addRandomSuffix: false, allowOverwrite: false })
  return { id, pathname: path, token: clientToken, contentType, name, size: input.size }
})
