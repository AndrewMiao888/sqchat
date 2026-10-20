import { requireCmsEditor } from '../../utils/auth'
import { findThread } from '../../utils/chat'
import { store } from '../../utils/store'
import { DEFAULT_CONVERSATION_THEME } from '#shared/types/chat'

export default defineEventHandler(async event => {
  const { user } = await requireCmsEditor(event)
  const query = getQuery(event)
  const conversation = typeof query.conversation === 'string' && query.conversation ? query.conversation : null
  if (conversation) await findThread(user, conversation)
  else if (user.privateOnly) throw createError({ statusCode: 403, statusMessage: 'This account uses private conversations only.' })
  const db = await store()
  const rows = await db`SELECT data FROM sq_conversation_themes WHERE conversation_key = ${conversation || 'shared'}`
  return { theme: { ...DEFAULT_CONVERSATION_THEME, ...(rows[0]?.data || {}) } }
})
