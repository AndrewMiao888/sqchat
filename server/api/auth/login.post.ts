import { store, audit } from '../../utils/store'
import { rateLimit, publicAccount, createSession } from '../../utils/auth'
import { verifyPassword } from '../../utils/passwords'
import { normalizePersonName } from '../../utils/chat'

export default defineEventHandler(async event => {
  const input = await readBody(event)
  const name = normalizePersonName(input?.name)?.toLowerCase() || ''
  await rateLimit(`login-name:${name}`, 10, 600)
  const db = await store()
  const rows = await db`SELECT * FROM sq_users WHERE name_key = ${name}`
  const row = rows[0]
  const valid = await verifyPassword(input?.password, row?.password_hash)
  if (!valid || row?.status !== 'active') {
    await audit(null, 'login.failed')
    throw createError({ statusCode: 401, statusMessage: 'Name or password is incorrect, or this account is not ready. Ask Andrew if you need access.' })
  }
  const result = await createSession(event, publicAccount(row), row.password_hash)
  await audit(row.id, 'login.success')
  return result
})
