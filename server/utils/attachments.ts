import { del, get, head } from '@vercel/blob'
import { store } from './store'
import { findThread } from './chat'
import type { Account } from '#shared/types/auth'

export async function accessibleAttachment(user: Account, id: string, ownerOnly = false) {
  const db = await store()
  const rows = await db`SELECT * FROM sq_attachments WHERE id = ${id} AND status NOT IN ('deleted','purged')`
  const file = rows[0]
  if (!file || (ownerOnly && file.owner_id !== user.id)) throw createError({ statusCode: 404, statusMessage: 'File not found.' })
  if (file.status !== 'attached') {
    if (file.owner_id !== user.id) throw createError({ statusCode: 404, statusMessage: 'File not found.' })
  } else {
    const parent = file.thread_id ? await db`SELECT id FROM sq_private_messages WHERE id = ${file.message_id}` : await db`SELECT id FROM chat_messages WHERE id = ${file.message_id}`
    if (!parent.length) throw createError({ statusCode: 404, statusMessage: 'File not found.' })
    if (file.thread_id) await findThread(user, file.thread_id)
    else if (user.privateOnly) throw createError({ statusCode: 404, statusMessage: 'File not found.' })
  }
  return file
}

export async function verifyUpload(file: any) {
  const details = await head(file.blob_path)
  if (details.size !== Number(file.size) || details.contentType.split(';')[0] !== file.content_type) throw createError({ statusCode: 400, statusMessage: 'The upload does not match the selected file.' })
  // Verify image signatures before allowing inline rendering. SVG and HTML are never accepted.
  if (file.content_type.startsWith('image/')) {
    const result = await get(file.blob_path, { access: 'private', headers: { Range: 'bytes=0-63' } })
    if (!result || result.statusCode !== 200) throw createError({ statusCode: 400, statusMessage: 'Could not verify this image.' })
    const reader = result.stream.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    while (length < 64) {
      const chunk = await reader.read()
      if (chunk.done) break
      chunks.push(chunk.value); length += chunk.value.length
    }
    await reader.cancel()
    const bytes = Buffer.concat(chunks).subarray(0, 64)
    const signatures: Record<string, boolean> = {
      'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
      'image/png': bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      'image/gif': /^GIF8[79]a/.test(bytes.toString('ascii', 0, 6)),
      'image/webp': bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
      'image/avif': bytes.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(bytes.toString('ascii', 8, 32)),
      'image/heic': bytes.toString('ascii', 4, 8) === 'ftyp' && /heic|heix|hevc|mif1/.test(bytes.toString('ascii', 8, 32)),
      'image/heif': bytes.toString('ascii', 4, 8) === 'ftyp' && /heic|heix|hevc|mif1/.test(bytes.toString('ascii', 8, 32))
    }
    if (!signatures[file.content_type]) throw createError({ statusCode: 400, statusMessage: 'This file is not a valid supported image.' })
  }
}

export async function removeAttachment(file: any) {
  const db = await store()
  const changed = await db`UPDATE sq_attachments SET status = 'deleted'
    WHERE id = ${file.id} AND status IN ('pending','ready','theme','deleted') RETURNING id, created_at`
  if (!changed.length) throw createError({ statusCode: 409, statusMessage: 'This file was already sent or removed.' })
  await del(file.blob_path)
  await db`UPDATE sq_attachments SET status = 'purged' WHERE id = ${file.id} AND status = 'deleted' AND created_at < NOW() - INTERVAL '20 minutes'`
}

export async function cleanAbandonedUploads() {
  const db = await store()
  const rows = await db`SELECT id, blob_path FROM sq_attachments WHERE (status IN ('pending','ready') AND created_at < NOW() - INTERVAL '24 hours')
    OR (status = 'theme' AND created_at < NOW() - INTERVAL '24 hours' AND NOT EXISTS (
      SELECT 1 FROM sq_conversation_themes t WHERE t.data->>'backgroundImageId' = sq_attachments.id
    ))
    OR (status = 'deleted' AND created_at < NOW() - INTERVAL '20 minutes') LIMIT 12`
  for (const row of rows) await removeAttachment(row).catch(() => {})
}
