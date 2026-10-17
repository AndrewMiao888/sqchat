import { getChatState } from '../utils/chat'
import { requireAuth } from '../utils/auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const { user } = await requireAuth(event)
  const query = getQuery(event)
  let before: { at: string; id: string } | null = null
  if (query.before) {
    try {
      if (typeof query.before !== 'string' || query.before.length > 400) throw new Error()
      const cursor = JSON.parse(Buffer.from(query.before, 'base64url').toString('utf8'))
      if (typeof cursor.at !== 'string' || cursor.at.length > 40 || !Number.isFinite(Date.parse(cursor.at)) || typeof cursor.id !== 'string' || cursor.id.length > 100) throw new Error()
      before = { at: cursor.at, id: cursor.id }
    } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid history position.' }) }
  }
  return getChatState(user, typeof query.conversation === 'string' && query.conversation ? query.conversation : null, before)
})
