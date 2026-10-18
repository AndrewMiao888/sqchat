import { store, audit, signal } from '../../utils/store'
import { digest, hashPassword, validatePassword } from '../../utils/passwords'
import { clientKey, rateLimit } from '../../utils/auth'
import { purgeExpiredSetupCodes } from '../../utils/setupCodes'

export default defineEventHandler(async event => {
  await rateLimit(`setup-ip:${clientKey(event)}`, 10, 600)
  const input = await readBody(event)
  validatePassword(input?.password)
  const code = typeof input?.code === 'string' ? input.code.trim() : ''
  if (!/^(?:[0-9]{6}|[0-9]{12}|[A-Za-z0-9_-]{43})$/.test(code)) throw createError({ statusCode: 400, statusMessage: 'Enter the numeric setup code Andrew gave you.' })
  const db = await store()
  await purgeExpiredSetupCodes()
  const invites = await db`SELECT i.user_id FROM sq_invites i JOIN sq_users u ON u.id = i.user_id
    WHERE i.token_hash = ${digest(code)} AND i.expires_at > NOW() AND i.used_at IS NULL AND i.revoked_at IS NULL
      AND u.status IN ('approved','active') AND u.role <> 'admin'`
  if (!invites[0]) throw createError({ statusCode: 400, statusMessage: 'That code has expired or was already used. Ask Andrew for a new one.' })
  const hash = await hashPassword(input.password)
  const rows = await db`WITH used AS (
    UPDATE sq_invites SET used_at = NOW() WHERE token_hash = ${digest(code)} AND expires_at > NOW()
      AND used_at IS NULL AND revoked_at IS NULL RETURNING user_id
  ), changed AS (
    UPDATE sq_users SET password_hash = ${hash}, status = 'active', password_change_until = NULL, session_version = session_version + 1
    WHERE id IN (SELECT user_id FROM used) AND status IN ('approved','active') AND role <> 'admin' RETURNING id, name
  ), revoked AS (DELETE FROM sq_sessions WHERE user_id IN (SELECT id FROM changed))
  SELECT * FROM changed`
  if (!rows[0]) throw createError({ statusCode: 409, statusMessage: 'That code was already used or cancelled. Ask Andrew for a new one.' })
  await audit(rows[0].id, 'password.setup')
  await signal()
  return { name: rows[0].name }
})
