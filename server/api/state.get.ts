import { getChatState } from '../utils/chat'
import { requireAuth } from '../utils/auth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const { user } = await requireAuth(event)
  const query = getQuery(event)
  return getChatState(user, typeof query.conversation === 'string' && query.conversation ? query.conversation : null)
})
