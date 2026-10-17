import { requireAdmin } from '../../utils/auth'
import { store } from '../../utils/store'

export default defineEventHandler(async event => {
  await requireAdmin(event)
  const db = await store()
  const rows = await db`SELECT value FROM sq_config WHERE key = 'setup_code_length'`
  return { length: rows[0]?.value === 'long' ? 'long' : 'short' }
})
