import { cleanText, updateSettings } from '../utils/chat'
import type { ChatSettings } from '#shared/types/chat'

const hexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
const choice = <T extends string>(value: unknown, options: readonly T[]): value is T => options.includes(value as T)

export default defineEventHandler(async (event) => {
  const input = await readBody(event)
  const title = cleanText(input?.title, 70)
  const subtitle = cleanText(input?.subtitle, 160)
  const notice = cleanText(input?.notice, 280)
  const welcome = cleanText(input?.welcome, 160)
  if (!title || !subtitle || !notice || !welcome) {
    throw createError({ statusCode: 400, statusMessage: 'Fill every field within its character limit.' })
  }
  const colors = [input?.pageBackground, input?.panelBackground, input?.bubbleBackground, input?.accentColor, input?.textColor]
  if (!colors.every(hexColor) ||
      !choice(input?.fontFamily, ['sans', 'rounded', 'serif', 'mono']) ||
      !choice(input?.messageAnimation, ['pop', 'bubble', 'slide', 'none']) ||
      !choice(input?.textAnimation, ['fade', 'rise', 'reveal', 'none']) ||
      !choice(input?.bubbleStyle, ['soft', 'pill', 'square'])) {
    throw createError({ statusCode: 400, statusMessage: 'Choose valid colours and style options.' })
  }
  const settings: ChatSettings = {
    title, subtitle, notice, welcome,
    pageBackground: input.pageBackground,
    panelBackground: input.panelBackground,
    bubbleBackground: input.bubbleBackground,
    accentColor: input.accentColor,
    textColor: input.textColor,
    fontFamily: input.fontFamily,
    messageAnimation: input.messageAnimation,
    textAnimation: input.textAnimation,
    bubbleStyle: input.bubbleStyle
  }
  return updateSettings(settings)
})
