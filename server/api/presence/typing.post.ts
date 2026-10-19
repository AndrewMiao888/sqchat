import { requireAuth, rateLimit } from '../../utils/auth'
import { findThread } from '../../utils/chat'
import { store } from '../../utils/store'

export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  const input = await readBody(event)
  if (typeof input?.typing !== 'boolean' || typeof input?.tabId !== 'string' || !/^[0-9a-f-]{36}$/.test(input.tabId)
    || (input?.conversation !== null && (typeof input?.conversation !== 'string' || input.conversation.length > 100))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid typing status.' })
  }
  const conversation: string | null = input.conversation || null
  if (input.typing) {
    if (conversation) await findThread(user, conversation, true)
    else if (user.privateOnly) throw createError({ statusCode: 403, statusMessage: 'This account uses private conversations only.' })
  }
  await rateLimit(`typing:${user.id}`, 50, 60)
  const db = await store()
  await db`DELETE FROM sq_typing WHERE expires_at < NOW()`
  if (input.typing) {
    await db`INSERT INTO sq_typing (user_id, conversation, tab_id, expires_at) VALUES (${user.id}, ${conversation || ''}, ${input.tabId}, NOW() + INTERVAL '10 seconds')
      ON CONFLICT (user_id, conversation, tab_id) DO UPDATE SET expires_at = EXCLUDED.expires_at`
  } else {
    await db`DELETE FROM sq_typing WHERE user_id = ${user.id} AND conversation = ${conversation || ''} AND tab_id = ${input.tabId}`
  }
  const participants = conversation ? await db`SELECT user_id FROM sq_thread_members WHERE thread_id = ${conversation}` : []
  await db`SELECT pg_notify('sqchat_presence', ${JSON.stringify(conversation ? { conversation, users: participants.map(row => row.user_id) } : { conversation: null })})`
  return { ok: true }
})
