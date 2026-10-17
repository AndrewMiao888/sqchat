import { requireAdmin, rateLimit } from '../../utils/auth'
import { store, audit, signal } from '../../utils/store'
import { token, digest } from '../../utils/passwords'

export default defineEventHandler(async event => {
  const { user } = await requireAdmin(event)
  await rateLimit(`admin-accounts:${user.id}`, 30, 60)
  const input = await readBody(event)
  const db = await store()
  const rows = await db`SELECT * FROM sq_users WHERE id = ${typeof input?.id === 'string' ? input.id : ''}`
  const target = rows[0]
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Account not found.' })
  if (target.role === 'admin') throw createError({ statusCode: 403, statusMessage: 'Manage your own password and sessions from My account.' })
  let code: string | undefined
  switch (input.action) {
    case 'allow-shared':
    case 'block-shared':
      await db`UPDATE sq_users SET private_only = ${input.action === 'block-shared'} WHERE id = ${target.id}`
      break
    case 'approve':
    case 'reset': {
      if (input.action === 'approve' && target.status === 'active') throw createError({ statusCode: 409, statusMessage: 'This account is already active.' })
      code = token()
      await db.transaction([
        db`UPDATE sq_users SET status = 'approved', password_hash = NULL, password_change_until = NULL, session_version = session_version + 1 WHERE id = ${target.id}`,
        db`DELETE FROM sq_sessions WHERE user_id = ${target.id}`,
        db`DELETE FROM sq_invites WHERE user_id = ${target.id}`,
        db`INSERT INTO sq_invites (token_hash, user_id, expires_at) VALUES (${digest(code)}, ${target.id}, NOW() + INTERVAL '24 hours')`
      ])
      break
    }
    case 'allow-password':
      if (target.status !== 'active') throw createError({ statusCode: 409, statusMessage: 'This account must finish setup first.' })
      await db`UPDATE sq_users SET password_change_until = NOW() + INTERVAL '24 hours' WHERE id = ${target.id}`
      break
    case 'cancel-password':
      await db`UPDATE sq_users SET password_change_until = NULL WHERE id = ${target.id}`
      break
    case 'revoke':
      await db.transaction([
        db`UPDATE sq_users SET session_version = session_version + 1 WHERE id = ${target.id}`,
        db`DELETE FROM sq_sessions WHERE user_id = ${target.id}`
      ])
      break
    case 'delete':
      if (target.builtin) throw createError({ statusCode: 403, statusMessage: 'Default accounts cannot be deleted.' })
      await db.transaction([
        db`UPDATE sq_users SET status = 'disabled', password_hash = NULL, password_change_until = NULL, session_version = session_version + 1 WHERE id = ${target.id}`,
        db`DELETE FROM sq_sessions WHERE user_id = ${target.id}`,
        db`DELETE FROM sq_invites WHERE user_id = ${target.id}`
      ])
      break
    default: throw createError({ statusCode: 400, statusMessage: 'Choose a valid account action.' })
  }
  await audit(user.id, `account.${input.action}`, target.id)
  await signal()
  return { ok: true, ...(code ? { code, name: target.name, expiresIn: '24 hours' } : {}) }
})
