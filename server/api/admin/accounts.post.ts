import { requireAdmin, rateLimit } from '../../utils/auth'
import { store, audit, signal } from '../../utils/store'
import { randomInt, randomUUID } from 'node:crypto'
import { digest } from '../../utils/passwords'
import { purgeExpiredSetupCodes, sealSetupCode } from '../../utils/setupCodes'

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
  let expiresAt: string | undefined
  switch (input.action) {
    case 'allow-cms':
    case 'block-cms':
      if (target.status !== 'active') throw createError({ statusCode: 409, statusMessage: 'This account must finish setup first.' })
      await db`UPDATE sq_users SET cms_editor = ${input.action === 'allow-cms'} WHERE id = ${target.id}`
      break
    case 'allow-moderation':
    case 'block-moderation':
      if (target.status !== 'active') throw createError({ statusCode: 409, statusMessage: 'This account must finish setup first.' })
      await db`UPDATE sq_users SET message_moderator = ${input.action === 'allow-moderation'} WHERE id = ${target.id}`
      break
    case 'allow-shared':
    case 'block-shared':
      await db`UPDATE sq_users SET private_only = ${input.action === 'block-shared'} WHERE id = ${target.id}`
      break
    case 'approve':
    case 'reset': {
      await purgeExpiredSetupCodes()
      if (input.action === 'approve' && target.status === 'active') throw createError({ statusCode: 409, statusMessage: 'This account is already active.' })
      const preferences = await db`SELECT value FROM sq_config WHERE key = 'setup_code_length'`
      const digits = preferences[0]?.value === 'long' ? 12 : 6
      for (let attempt = 0; attempt < 10; attempt++) {
        code = randomInt(0, 10 ** digits).toString().padStart(digits, '0')
        const collision = await db`SELECT 1 FROM sq_invites WHERE token_hash = ${digest(code)} AND expires_at > NOW()`
        if (!collision.length) break
        code = undefined
      }
      if (!code) throw createError({ statusCode: 503, statusMessage: 'Could not create a unique setup code. Try again.' })
      const issued = await db.transaction([
        db`UPDATE sq_users SET status = 'approved', password_hash = NULL, password_change_until = NULL, session_version = session_version + 1 WHERE id = ${target.id}`,
        db`DELETE FROM sq_sessions WHERE user_id = ${target.id}`,
        db`UPDATE sq_invites SET revoked_at = NOW() WHERE user_id = ${target.id} AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`,
        db`INSERT INTO sq_invites (id, token_hash, user_id, code_ciphertext, expires_at)
          VALUES (${randomUUID()}, ${digest(code)}, ${target.id}, ${await sealSetupCode(code)}, NOW() + INTERVAL '3 days') RETURNING expires_at`
      ])
      expiresAt = issued[3]?.[0]?.expires_at
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
        db`UPDATE sq_users SET status = 'disabled', cms_editor = FALSE, message_moderator = FALSE, password_hash = NULL, password_change_until = NULL, session_version = session_version + 1 WHERE id = ${target.id}`,
        db`DELETE FROM sq_sessions WHERE user_id = ${target.id}`,
        db`UPDATE sq_invites SET revoked_at = NOW() WHERE user_id = ${target.id} AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`
      ])
      break
    default: throw createError({ statusCode: 400, statusMessage: 'Choose a valid account action.' })
  }
  await audit(user.id, `account.${input.action}`, target.id)
  await signal()
  return { ok: true, ...(code ? { code, name: target.name, expiresAt } : {}) }
})
