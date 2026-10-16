import { addPerson, normalizePersonName } from '../utils/chat'

export default defineEventHandler(async (event) => {
  const input = await readBody(event)
  const name = normalizePersonName(input?.name)
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Use a name of up to 24 letters, numbers, spaces, apostrophes or hyphens.' })
  const result = await addPerson(name)
  if (result === 'duplicate') throw createError({ statusCode: 409, statusMessage: 'That name is already in the room.' })
  if (result === 'full') throw createError({ statusCode: 409, statusMessage: 'The room has reached its name limit.' })
  return { name }
})
