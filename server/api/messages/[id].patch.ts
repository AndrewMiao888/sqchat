import { cleanText, updateMessage } from '../../utils/chat'
import { requireAdmin } from '../../utils/auth'
import { audit } from '../../utils/store'

export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)
  const id = getRouterParam(event, 'id') || ''
  const input = await readBody(event)
  const body = cleanText(input?.body, 1000)
  if (!body) throw createError({ statusCode: 400, statusMessage: 'Write a message under 1,000 characters.' })
  const message = await updateMessage(id, body)
  if (!message) throw createError({ statusCode: 404, statusMessage: 'Message not found.' })
  await audit(user.id, 'message.edited', id)
  return message
})
