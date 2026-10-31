import { Client } from 'pg'
import { createEventStream } from 'h3'
import { requireAuth, sessionForHash, sessionRows, rateLimit } from '../utils/auth'
import { store } from '../utils/store'
import { randomUUID } from 'node:crypto'

export default defineEventHandler(async event => {
  const auth = await requireAuth(event)
  await rateLimit(`streams:${auth.user.id}`, 15, 60)
  const db = await store()
  const lease = randomUUID()
  const result = await db.transaction([
    db`SELECT pg_advisory_xact_lock(hashtext(${auth.user.id}))`,
    db`DELETE FROM sq_streams WHERE expires_at < NOW()`,
    db`INSERT INTO sq_streams (id, user_id, expires_at)
      SELECT ${lease}, ${auth.user.id}, NOW() + INTERVAL '40 seconds'
      WHERE (SELECT COUNT(*) FROM sq_streams WHERE user_id = ${auth.user.id}) < 6 RETURNING id`
  ])
  if (!result[2]?.length) throw createError({ statusCode: 429, statusMessage: 'Too many live tabs. Close another SQ Chat tab and try again.' })
  setHeader(event, 'Cache-Control', 'no-store, no-transform')
  setHeader(event, 'X-Accel-Buffering', 'no')
  const stream = createEventStream(event)
  const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL })
  let closed = false
  let checking = false
  const push = async (name: string, data = '{}') => {
    if (!closed) await stream.push({ event: name, data, retry: 2000 }).catch(() => {})
  }
  const check = async (name: string, data = '{}') => {
    if (closed) return
    try {
      if (!await sessionForHash(auth.hash)) {
        await push('expired')
        await stream.close()
      } else await push(name, data)
    } catch { await stream.close().catch(() => {}) }
  }
  client.on('notification', notification => {
    if (notification.channel === 'sqchat_presence') {
      try {
        const payload = JSON.parse(notification.payload || '{}')
        const allowed = payload.online === true || auth.user.role === 'admin'
          || (payload.conversation === null && !auth.user.privateOnly)
          || (Array.isArray(payload.users) && payload.users.includes(auth.user.id))
        if (allowed) void check('presence', notification.payload || '{}')
      } catch {}
      return
    }
    let allowed = notification.payload === 'change'
    if (!allowed) {
      try {
        const payload = JSON.parse(notification.payload || '{}')
        allowed = payload.privateEvent === true
          ? auth.user.role === 'admin'
          : auth.user.role === 'admin' || (payload.conversation === null && !auth.user.privateOnly)
            || (Array.isArray(payload.users) && payload.users.includes(auth.user.id))
      } catch { return }
    }
    if (allowed) void check('change', notification.payload || '{}')
  })
  client.on('error', () => { void stream.close().catch(() => {}) })
  try { await client.connect(); await client.query('LISTEN sqchat_changes'); await client.query('LISTEN sqchat_presence') }
  catch (error) {
    await client.end().catch(() => {})
    await db`DELETE FROM sq_streams WHERE id = ${lease}`.catch(() => {})
    throw error
  }
  const heartbeat = setInterval(async () => {
    if (checking) return
    checking = true
    try {
      // One database request renews the lease and rechecks the session.
      const [, session] = await db.transaction([
        db`UPDATE sq_streams SET expires_at = NOW() + INTERVAL '40 seconds' WHERE id = ${lease}`,
        sessionRows(db, auth.hash)
      ])
      if (!closed) {
        if (!session?.length) {
          await push('expired')
          await stream.close()
        } else await push('heartbeat')
      }
    } catch { await stream.close().catch(() => {}) }
    checking = false
  }, 15000)
  const lifespan = setTimeout(() => { void stream.close().catch(() => {}) }, 240000)
  stream.onClosed(() => {
    closed = true
    clearInterval(heartbeat)
    clearTimeout(lifespan)
    void client.end().catch(() => {})
    void (async () => {
      const removed = await db`DELETE FROM sq_streams WHERE id = ${lease} RETURNING id`
      if (removed.length) await db`SELECT pg_notify('sqchat_presence', '{"online":true}')`
    })().catch(() => {})
  })
  await db`SELECT pg_notify('sqchat_presence', '{"online":true}')`.catch(() => {})
  setTimeout(() => { void check('ready') }, 0)
  return stream.send()
})
