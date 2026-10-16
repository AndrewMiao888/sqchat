import { cleanText, updateMessage } from '../../utils/chat'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  const input = await readBody(event)
  const body = cleanText(input?.body, 1000)
  if (!body) throw createError({ statusCode: 400, statusMessage: 'Write a message under 1,000 characters.' })
  const message = await updateMessage(id, body)
  if (!message) throw createError({ statusCode: 404, statusMessage: 'Message not found.' })
  return message
})
