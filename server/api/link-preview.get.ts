import { requireAuth, rateLimit } from '../utils/auth'
import { fetchPreview, previewUrl } from '../utils/linkPreview'

const cache = new Map<string, { expires: number; data: { title: string; description: string } }>()
export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  const input = getQuery(event).url
  let url: string
  try { url = previewUrl(typeof input === 'string' ? input : '').href }
  catch { throw createError({ statusCode: 400, statusMessage: 'Choose an HTTP or HTTPS link.' }) }
  const cached = cache.get(url)
  if (cached && cached.expires > Date.now()) return cached.data
  await rateLimit(`preview:${user.id}`, 90, 60)
  let data = { title: '', description: '' }
  try { data = await fetchPreview(url, AbortSignal.timeout(4000)) } catch { /* Blocked or unavailable sites keep a clickable URL card. */ }
  if (cache.size >= 200) cache.delete(cache.keys().next().value!)
  cache.set(url, { expires: Date.now() + 5 * 60 * 1000, data })
  return data
})
