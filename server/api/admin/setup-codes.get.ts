import { requireAdmin } from '../../utils/auth'
import { store } from '../../utils/store'
import { openSetupCode, purgeExpiredSetupCodes } from '../../utils/setupCodes'

export default defineEventHandler(async event => {
  await requireAdmin(event)
  await purgeExpiredSetupCodes()
  const db = await store()
  const rows = await db`SELECT i.id, i.code_ciphertext, i.created_at, i.expires_at, i.used_at, i.revoked_at, u.name
    FROM sq_invites i JOIN sq_users u ON u.id = i.user_id
    WHERE i.id IS NOT NULL AND i.code_ciphertext IS NOT NULL AND i.expires_at > NOW()
    ORDER BY i.created_at DESC`
  return Promise.all(rows.map(async row => ({ id: row.id, code: await openSetupCode(row.code_ciphertext),
    name: row.name, createdAt: row.created_at, expiresAt: row.expires_at,
    status: row.used_at ? 'used' : row.revoked_at ? 'revoked' : 'active' })))
})
