import { requireAuth, rateLimit } from '../../utils/auth'
import { fetchPreviewImage, previewUrl } from '../../utils/linkPreview'

export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  const input = getQuery(event).url
  let url: string
  try { url = previewUrl(typeof input === 'string' ? input : '').href }
  catch { throw createError({ statusCode: 400, statusMessage: 'Invalid preview image.' }) }
  await rateLimit(`preview-image:${user.id}`, 90, 60)
  let image: Buffer
  try { image = await fetchPreviewImage(url, AbortSignal.timeout(5000)) }
  catch { throw createError({ statusCode: 404, statusMessage: 'Preview image unavailable.' }) }
  const type = image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : image.subarray(0, 3).equals(Buffer.from([255,216,255])) ? 'image/jpeg'
      : image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp'
        : image.toString('ascii', 0, 6).match(/^GIF8[79]a$/) ? 'image/gif' : ''
  if (!type) throw createError({ statusCode: 404, statusMessage: 'Preview image unavailable.' })
  setHeader(event, 'Content-Type', type)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return image
})
