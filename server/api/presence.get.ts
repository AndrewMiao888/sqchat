import { requireAuth } from '../utils/auth'
import { findThread } from '../utils/chat'
import { store } from '../utils/store'
import type { PresenceState } from '#shared/types/presence'

export default defineEventHandler(async (event): Promise<PresenceState> => {
  const { user } = await requireAuth(event)
  const query = getQuery(event)
  const conversation = typeof query.conversation === 'string' && query.conversation ? query.conversation : null
  if (!conversation && user.privateOnly) return { members: [] }
  const ids = conversation ? (await findThread(user, conversation)).members.filter(member => member.active).map(member => member.id) : []
  const db = await store()
  const rows = conversation
    ? await db`SELECT u.id, u.name,
        EXISTS (SELECT 1 FROM sq_streams s WHERE s.user_id = u.id AND s.expires_at > NOW()) AS online,
        EXISTS (SELECT 1 FROM sq_typing t WHERE t.user_id = u.id AND t.conversation = ${conversation} AND t.expires_at > NOW()) AS typing
        FROM sq_users u WHERE u.status = 'active' AND u.id = ANY(${ids}::text[]) ORDER BY u.name`
    : await db`SELECT u.id, u.name,
        EXISTS (SELECT 1 FROM sq_streams s WHERE s.user_id = u.id AND s.expires_at > NOW()) AS online,
        EXISTS (SELECT 1 FROM sq_typing t WHERE t.user_id = u.id AND t.conversation = '' AND t.expires_at > NOW()) AS typing
        FROM sq_users u WHERE u.status = 'active' AND NOT u.private_only ORDER BY u.name`
  return { members: rows.map(row => ({ id: row.id, name: row.name, online: row.online, typing: row.typing })) }
})
