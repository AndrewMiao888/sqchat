import { requireAdmin, publicAccount } from '../../utils/auth'
import { store } from '../../utils/store'
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const db = await store()
  const rows = await db`SELECT * FROM sq_users ORDER BY builtin DESC, created_at ASC, name ASC`
  return rows.map(publicAccount)
})
