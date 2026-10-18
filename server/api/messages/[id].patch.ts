import { cleanText, updateMessage } from '../../utils/chat'
import { requireAuth } from '../../utils/auth'
import { audit } from '../../utils/store'
import { messageEffects } from '../../utils/effects'

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const id = getRouterParam(event, 'id') || ''
  const input = await readBody(event)
  const body = cleanText(input?.body, 1000)
  if (!body) throw createError({ statusCode: 400, statusMessage: 'Write a message under 1,000 characters.' })
  const effects = input?.effects === undefined ? undefined : messageEffects(input.effects, body, false)
  const message = await updateMessage(id, body, user, effects)
  if (!message) throw createError({ statusCode: 404, statusMessage: 'Message not found or you cannot edit it.' })
  await audit(user.id, 'message.edited', id)
  return message
})
