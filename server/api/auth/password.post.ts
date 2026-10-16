import { requireAuth, sessionCookie } from '../../utils/auth'
import { store, audit, signal } from '../../utils/store'
import { hashPassword, verifyPassword, validatePassword } from '../../utils/passwords'
import { rateLimit } from '../../utils/auth'

export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  await rateLimit(`password:${user.id}`, 8, 600)
  const input = await readBody(event)
  validatePassword(input?.password)
  const db = await store()
  const rows = await db`SELECT password_hash FROM sq_users WHERE id = ${user.id}
    AND (role = 'admin' OR password_change_until > NOW()) AND status = 'active'`
  if (!rows[0]) throw createError({ statusCode: 403, statusMessage: 'Ask Andrew to allow a password change first.' })
  if (!await verifyPassword(input?.currentPassword, rows[0].password_hash)) throw createError({ statusCode: 400, statusMessage: 'Your current password is incorrect.' })
  if (input.password === input.currentPassword) throw createError({ statusCode: 400, statusMessage: 'Choose a different password.' })
  const hash = await hashPassword(input.password)
  const changed = await db`WITH changed AS (
    UPDATE sq_users SET password_hash = ${hash}, password_change_until = NULL, session_version = session_version + 1
    WHERE id = ${user.id} AND password_hash = ${rows[0].password_hash}
      AND (role = 'admin' OR password_change_until > NOW()) AND status = 'active' RETURNING id
  ), revoked AS (DELETE FROM sq_sessions WHERE user_id IN (SELECT id FROM changed)) SELECT id FROM changed`
  if (!changed.length) throw createError({ statusCode: 409, statusMessage: 'Your account changed. Sign in again.' })
  deleteCookie(event, sessionCookie(), { path: '/', secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'strict' })
  await audit(user.id, 'password.changed')
  await signal([user.id])
  return { ok: true }
})
