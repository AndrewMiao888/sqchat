import { requireAuth, revokeSessions, sessionCookie } from '../../utils/auth'
import { audit } from '../../utils/store'
export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  await revokeSessions(user.id)
  deleteCookie(event, sessionCookie(), { path: '/', secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'strict' })
  await audit(user.id, 'sessions.revoked')
  return { ok: true }
})
