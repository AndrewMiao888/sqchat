import { TEXT_EFFECTS, BUBBLE_EFFECTS, SCREEN_EFFECTS, type MessageEffects } from '#shared/types/media'
export function messageEffects(input: any, body: string, auto = true): MessageEffects {
  const result: MessageEffects = {}
  if (input?.text !== undefined) {
    if (!Array.isArray(input.text) || input.text.length > 12) throw createError({ statusCode: 400, statusMessage: 'Use up to 12 text effects per message.' })
    result.text = input.text.map((span: any) => {
      if (!span || !TEXT_EFFECTS.includes(span.effect) || !Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end > body.length || span.start >= span.end) {
        throw createError({ statusCode: 400, statusMessage: 'Choose valid text and an effect.' })
      }
      return { start: span.start, end: span.end, effect: span.effect }
    })
  }
  if (input?.bubble) {
    if (!BUBBLE_EFFECTS.includes(input.bubble)) throw createError({ statusCode: 400, statusMessage: 'Choose a valid bubble effect.' })
    result.bubble = input.bubble
  }
  if (input?.screen) {
    if (!SCREEN_EFFECTS.includes(input.screen)) throw createError({ statusCode: 400, statusMessage: 'Choose a valid screen effect.' })
    result.screen = input.screen
  } else if (auto) {
    const text = body.toLowerCase()
    if (/\bhappy birthday\b/.test(text)) result.screen = 'balloons'
    else if (/\b(congratulations|congrats)\b/.test(text)) result.screen = 'confetti'
    else if (/\bhappy new year\b/.test(text)) result.screen = 'fireworks'
    else if (/\b(happy anniversary|happy holidays|happy diwali|happy lunar new year)\b/.test(text)) result.screen = 'celebration'
  }
  return result
}
