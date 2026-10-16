import { getChatState } from '../utils/chat'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  return getChatState()
})
