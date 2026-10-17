import { requireAuth } from '../utils/auth'
import { store } from '../utils/store'
export default defineEventHandler(async event => {
  const { hash } = await requireAuth(event)
  const db = await store()
  await db`DELETE FROM sq_push WHERE session_hash = ${hash}`
  return { enabled: false }
})
