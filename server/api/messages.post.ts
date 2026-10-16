import { addMessage, allowMessage, cleanText, personExists } from '../utils/chat'

export default defineEventHandler(async (event) => {
  const input = await readBody(event)
  const sender = typeof input?.sender === 'string' ? input.sender : ''
  if (!await personExists(sender)) throw createError({ statusCode: 400, statusMessage: 'Choose a current name first.' })
  const body = cleanText(input?.body, 1000)
  if (!body) throw createError({ statusCode: 400, statusMessage: 'Write a message under 1,000 characters.' })
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  if (!await allowMessage(ip)) throw createError({ statusCode: 429, statusMessage: 'Wait a moment before sending again.' })
  return addMessage(sender, body)
})
