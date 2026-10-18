import { requireAuth } from '../../utils/auth'
import { store, signal } from '../../utils/store'

export default defineEventHandler(async event => {
  const { user } = await requireAuth(event)
  const input = await readBody(event)
  if (input?.sort !== 'viewed' && input?.sort !== 'contributed') throw createError({ statusCode: 400, statusMessage: 'Choose a valid chat order.' })
  const db = await store()
  await db`UPDATE sq_users SET chat_sort = ${input.sort} WHERE id = ${user.id}`
  await signal([user.id])
  return { sort: input.sort }
})
