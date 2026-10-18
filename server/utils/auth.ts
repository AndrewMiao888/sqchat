import type { H3Event } from 'h3'
import { timingSafeEqual } from 'node:crypto'
import { store, signal } from './store'
import { token, digest } from './passwords'
import type { Account } from '#shared/types/auth'

export type AuthSession = { user: Account; hash: string; csrf: string }
export const sessionCookie = () => process.env.NODE_ENV === 'production' ? '__Host-sq_session' : 'sq_session'
const SESSION_IDLE_DAYS = 365
const SESSION_COOKIE_SECONDS = SESSION_IDLE_DAYS * 24 * 60 * 60

export function publicAccount(row: any): Account {
  return { id: row.id, name: row.name, role: row.role, builtin: row.builtin, status: row.status,
    privateOnly: !!row.private_only, homeConversation: row.home_thread || null, lastConversation: row.last_chat ?? null,
    canChangePassword: row.role === 'admin' || !!(row.password_change_until && new Date(row.password_change_until).getTime() > Date.now()) }
}

export async function sessionForHash(hash: string, touch = false): Promise<AuthSession | null> {
  const db = await store()
  const rows = await db`SELECT u.*, s.csrf FROM sq_sessions s JOIN sq_users u ON u.id = s.user_id
    WHERE s.token_hash = ${hash} AND s.expires_at > NOW() AND s.last_seen > NOW() - INTERVAL '365 days'
      AND u.status = 'active' AND s.session_version = u.session_version`
  if (!rows[0]) return null
  if (touch) await db`UPDATE sq_sessions SET last_seen = NOW(), expires_at = NOW() + INTERVAL '365 days'
    WHERE token_hash = ${hash} AND last_seen < NOW() - INTERVAL '1 minute'`
  return { user: publicAccount(rows[0]), csrf: rows[0].csrf, hash }
}

export async function getAuth(event: H3Event): Promise<AuthSession | null> {
  if (event.context.sqAuth !== undefined) return event.context.sqAuth
  const raw = getCookie(event, sessionCookie())
  event.context.sqAuth = raw && /^[A-Za-z0-9_-]{43}$/.test(raw) ? await sessionForHash(digest(raw), true) : null
  if (event.context.sqAuth) setCookie(event, sessionCookie(), raw!, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: SESSION_COOKIE_SECONDS
  })
  return event.context.sqAuth
}

export async function requireAuth(event: H3Event) {
  const auth = await getAuth(event)
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'Please sign in to continue.' })
  return auth
}

export async function requireAdmin(event: H3Event) {
  const auth = await requireAuth(event)
  if (auth.user.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Only Andrew can do that.' })
  return auth
}

export function checkCsrf(event: H3Event, auth: AuthSession) {
  const supplied = getHeader(event, 'x-sq-csrf') || ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(auth.csrf))) {
    throw createError({ statusCode: 403, statusMessage: 'Your security token expired. Sign in again.' })
  }
}

export async function createSession(event: H3Event, user: Account, expectedHash: string) {
  const db = await store()
  const raw = token()
  const csrf = token()
  const inserted = await db`INSERT INTO sq_sessions (token_hash, user_id, csrf, expires_at, session_version)
    SELECT ${digest(raw)}, id, ${csrf}, NOW() + INTERVAL '365 days', session_version FROM sq_users
    WHERE id = ${user.id} AND status = 'active' AND password_hash = ${expectedHash} RETURNING token_hash`
  if (!inserted.length) throw createError({ statusCode: 401, statusMessage: 'Your account changed. Please sign in again.' })
  const previous = getCookie(event, sessionCookie())
  if (previous) await db`DELETE FROM sq_sessions WHERE token_hash = ${digest(previous)}`
  // Keep five most recent devices and purge expired sessions.
  await db`DELETE FROM sq_sessions WHERE expires_at < NOW() OR last_seen < NOW() - INTERVAL '365 days'
    OR (user_id = ${user.id} AND token_hash NOT IN (
      SELECT token_hash FROM sq_sessions WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 5
    ))`
  setCookie(event, sessionCookie(), raw, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: SESSION_COOKIE_SECONDS })
  return { user, csrf }
}

export async function revokeSessions(userId: string) {
  const db = await store()
  await db.transaction([
    db`UPDATE sq_users SET session_version = session_version + 1 WHERE id = ${userId}`,
    db`DELETE FROM sq_sessions WHERE user_id = ${userId}`
  ])
  await signal([userId])
}

export async function rateLimit(key: string, max: number, seconds: number) {
  const db = await store()
  const rows = await db`INSERT INTO sq_limits (key, hits, expires_at)
    VALUES (${digest(key)}, 1, NOW() + ${seconds} * INTERVAL '1 second')
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN sq_limits.expires_at < NOW() THEN 1 ELSE LEAST(sq_limits.hits + 1, ${max + 1}) END,
      expires_at = CASE WHEN sq_limits.expires_at < NOW() THEN EXCLUDED.expires_at ELSE sq_limits.expires_at END
    RETURNING hits`
  if (rows[0]!.hits > max) throw createError({ statusCode: 429, statusMessage: 'Too many attempts. Please wait a few minutes and try again.' })
}

export function clientKey(event: H3Event) {
  // Vercel overwrites this header. Locally use the socket address, not supplied proxy headers.
  return (process.env.VERCEL ? getHeader(event, 'x-vercel-forwarded-for')?.split(',')[0]?.trim() : getRequestIP(event)) || 'unknown'
}
