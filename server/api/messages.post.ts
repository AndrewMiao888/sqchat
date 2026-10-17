import { addMessage, cleanText } from '../utils/chat'
import { requireAuth, rateLimit } from '../utils/auth'
import { messageEffects } from '../utils/effects'
import { MAX_ATTACHMENTS } from '#shared/types/media'

export default defineEventHandler(async (event) => {
  const input = await readBody(event)
  const { user } = await requireAuth(event)
  if (input?.sender !== undefined) throw createError({ statusCode: 400, statusMessage: 'Your signed-in account determines the sender.' })
  const attachments = Array.isArray(input?.attachments) ? [...new Set<string>(input.attachments)] : []
  if (attachments.length > MAX_ATTACHMENTS || attachments.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))) throw createError({ statusCode: 400, statusMessage: 'Choose up to four uploaded files.' })
  const body = input?.body === '' && attachments.length ? '' : cleanText(input?.body, 1000)
  if (body === null || body === undefined) throw createError({ statusCode: 400, statusMessage: 'Write a message under 1,000 characters or attach a file.' })
  const effects = messageEffects(input?.effects, body, input?.autoScreen !== false)
  const replyTo = input?.replyTo || null
  if (replyTo !== null && (typeof replyTo !== 'string' || replyTo.length > 100)) throw createError({ statusCode: 400, statusMessage: 'Choose a message to reply to.' })
  await rateLimit(`message:${user.id}`, 1, 2)
  return addMessage(user, body, typeof input?.conversation === 'string' && input.conversation ? input.conversation : null, effects, attachments, replyTo)
})
