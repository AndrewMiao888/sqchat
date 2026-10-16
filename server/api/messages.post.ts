import { addMessage, cleanText } from '../utils/chat'
import { requireAuth, rateLimit } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const input = await readBody(event)
  const { user } = await requireAuth(event)
  if (input?.sender !== undefined) throw createError({ statusCode: 400, statusMessage: 'Your signed-in account determines the sender.' })
  const body = cleanText(input?.body, 1000)
  if (!body) throw createError({ statusCode: 400, statusMessage: 'Write a message under 1,000 characters.' })
  await rateLimit(`message:${user.id}`, 1, 2)
  return addMessage(user, body, typeof input?.conversation === 'string' && input.conversation ? input.conversation : null)
})
