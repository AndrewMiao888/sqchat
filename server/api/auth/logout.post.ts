import { requireAuth, sessionCookie } from '../../utils/auth'
import { store, signal } from '../../utils/store'
export default defineEventHandler(async event => {
  const auth = await requireAuth(event)
  const db = await store()
  await db`DELETE FROM sq_sessions WHERE token_hash = ${auth.hash}`
  deleteCookie(event, sessionCookie(), { path: '/', secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'strict' })
  await signal([auth.user.id])
  return { ok: true }
})
