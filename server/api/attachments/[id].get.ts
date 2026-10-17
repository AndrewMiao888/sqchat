import { get } from '@vercel/blob'
import { requireAuth } from '../../utils/auth'
import { accessibleAttachment } from '../../utils/attachments'
export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  const file = await accessibleAttachment(user, getRouterParam(event, 'id') || '')
  if (!['ready','attached'].includes(file.status)) throw createError({ statusCode: 404, statusMessage: 'File is not ready.' })
  const range = getHeader(event, 'range')
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    const size = Number(file.size)
    if (!match || (!match[1] && !match[2]) || (match[1] && (Number(match[1]) >= size || (match[2] && Number(match[2]) < Number(match[1])))) || (!match[1] && Number(match[2]) < 1)) {
      setHeader(event, 'Content-Range', `bytes */${size}`)
      throw createError({ statusCode: 416, statusMessage: 'Invalid byte range.' })
    }
  }
  const result = await get(file.blob_path, { access: 'private', ...(range ? { headers: { Range: range } } : {}) })
  if (!result || result.statusCode !== 200) throw createError({ statusCode: 404, statusMessage: 'File not found.' })
  const inline = /^(image\/(jpeg|png|gif|webp|avif)|video\/|audio\/)/.test(file.content_type) && getQuery(event).download !== '1'
  setHeaders(event, {
    'Content-Type': inline ? file.content_type : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="download.${file.name.split('.').at(-1)?.replace(/[^a-zA-Z0-9]/g, '') || 'bin'}"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`,
    'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes',
    'Content-Security-Policy': "default-src 'none'; sandbox"
  })
  const contentRange = result.headers.get('content-range')
  if (contentRange) { setResponseStatus(event, 206); setHeader(event, 'Content-Range', contentRange) }
  const length = result.headers.get('content-length')
  if (length) setHeader(event, 'Content-Length', Number(length))
  return sendStream(event, result.stream)
})
