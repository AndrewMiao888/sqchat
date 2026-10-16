import { deleteMessage } from '../../utils/chat'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') || ''
  if (!await deleteMessage(id)) throw createError({ statusCode: 404, statusMessage: 'Message not found.' })
  return { ok: true }
})
