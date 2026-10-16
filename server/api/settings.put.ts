import { cleanText, updateSettings } from '../utils/chat'

export default defineEventHandler(async (event) => {
  const input = await readBody(event)
  const title = cleanText(input?.title, 70)
  const subtitle = cleanText(input?.subtitle, 160)
  const notice = cleanText(input?.notice, 280)
  const welcome = cleanText(input?.welcome, 160)
  if (!title || !subtitle || !notice || !welcome) {
    throw createError({ statusCode: 400, statusMessage: 'Fill every field within its character limit.' })
  }
  return updateSettings({ title, subtitle, notice, welcome })
})
