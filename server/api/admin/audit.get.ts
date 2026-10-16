import { requireAdmin } from '../../utils/auth'
import { store } from '../../utils/store'
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const db = await store()
  return db`SELECT a.action, a.created_at AS "createdAt", u.name AS actor, t.name AS target
    FROM sq_audit a LEFT JOIN sq_users u ON a.actor_id = u.id LEFT JOIN sq_users t ON a.target = t.id
    ORDER BY a.created_at DESC LIMIT 100`
})
