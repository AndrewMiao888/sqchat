import { randomUUID } from 'node:crypto'
import { store, signal, audit } from '../../utils/store'
import { normalizePersonName } from '../../utils/chat'

export default defineEventHandler(async event => {
  const input = await readBody(event)
  const name = normalizePersonName(input?.name)
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Use a name of up to 24 characters, starting with a letter.' })
  const db = await store()
  const results = await db.transaction([
    db`SELECT pg_advisory_xact_lock(84372501)`,
    db`INSERT INTO sq_users (id, name, name_key)
      SELECT ${randomUUID()}, ${name}, ${name.toLowerCase()} WHERE (SELECT COUNT(*) FROM sq_users WHERE NOT builtin AND status <> 'disabled') < 20
      ON CONFLICT (name_key) DO NOTHING RETURNING id`
  ])
  if (results[1]?.[0]) await audit(null, 'account.requested', results[1][0].id)
  const admins = await db`SELECT id FROM sq_users WHERE role = 'admin'`
  await signal(admins.map(row => row.id))
  return { ok: true, message: 'Ask Andrew to approve your name and share a setup code with you. Only use a code Andrew gives you directly.' }
})
