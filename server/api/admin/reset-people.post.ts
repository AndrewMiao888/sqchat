import { requireAdmin } from '../../utils/auth'
import { store, audit, signal } from '../../utils/store'
export default defineEventHandler(async event => {
  const { user } = await requireAdmin(event)
  const db = await store()
  await db.transaction([
    db`UPDATE sq_users SET status = 'disabled', password_hash = NULL, password_change_until = NULL, session_version = session_version + 1 WHERE NOT builtin`,
    db`DELETE FROM sq_sessions WHERE user_id IN (SELECT id FROM sq_users WHERE NOT builtin)`,
    db`DELETE FROM sq_invites WHERE user_id IN (SELECT id FROM sq_users WHERE NOT builtin)`
  ])
  await audit(user.id, 'accounts.reset-defaults')
  await signal()
  return { ok: true }
})
