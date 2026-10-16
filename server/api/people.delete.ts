import { deletePerson, normalizePersonName } from '../utils/chat'
import { PEOPLE } from '#shared/types/chat'

export default defineEventHandler(async (event) => {
  const input = await readBody(event)
  const name = normalizePersonName(input?.name)
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Choose a name to remove.' })
  if (PEOPLE.some(person => person.toLowerCase() === name.toLowerCase())) {
    throw createError({ statusCode: 403, statusMessage: 'The three original names cannot be removed.' })
  }
  if (!await deletePerson(name)) throw createError({ statusCode: 404, statusMessage: 'That name is no longer in the room.' })
  return { ok: true }
})
