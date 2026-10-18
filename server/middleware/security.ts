import { getAuth, requireAuth, checkCsrf, clientKey, rateLimit } from '../utils/auth'

const anonymous = new Set(['/api/auth/login', '/api/auth/setup', '/api/auth/request', '/api/cron/expire-codes'])

export default defineEventHandler(async event => {
  setHeaders(event, {
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-store'
  })
  if (process.env.NODE_ENV === 'production') setHeader(event, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  const path = getRequestURL(event).pathname.replace(/\/+$/, '')
  if (!path.startsWith('/api/')) return
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(event.method)
  if (mutation) {
    const origin = getHeader(event, 'origin')
    const expected = getRequestURL(event, { xForwardedHost: false }).origin
    if (origin !== expected || getHeader(event, 'x-requested-with') !== 'SQChat' || getHeader(event, 'sec-fetch-site') === 'cross-site') {
      throw createError({ statusCode: 403, statusMessage: 'This request must come from SQ Chat.' })
    }
    if (!getHeader(event, 'content-type')?.startsWith('application/json')) throw createError({ statusCode: 415, statusMessage: 'JSON is required.' })
    if (Number(getHeader(event, 'content-length') || 0) > 16384) throw createError({ statusCode: 413, statusMessage: 'Request is too large.' })
    const raw = await readRawBody(event)
    if (raw && Buffer.byteLength(raw) > 16384) throw createError({ statusCode: 413, statusMessage: 'Request is too large.' })
  }
  if (anonymous.has(path)) {
    if (mutation) await rateLimit(`auth-ip:${clientKey(event)}`, 60, 600)
    return
  }
  if (path === '/api/auth/me' && !mutation) { await getAuth(event); return }
  const auth = await requireAuth(event)
  if (mutation) {
    checkCsrf(event, auth)
    await rateLimit(`writes:${auth.user.id}`, 90, 60)
  }
})
