import { Client } from 'pg'
import { createEventStream } from 'h3'
import { listenForLocalChanges } from '../utils/realtime'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-cache, no-transform')
  setHeader(event, 'X-Accel-Buffering', 'no')
  const stream = createEventStream(event)
  let closed = false
  let client: Client | undefined
  let stopLocal: (() => void) | undefined

  const push = (name: string) => {
    if (!closed) void stream.push({ event: name, data: '{}', retry: 1000 }).catch(() => {})
  }

  if (process.env.DATABASE_URL) {
    client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL })
    client.on('notification', () => push('change'))
    client.on('error', () => { void stream.close().catch(() => {}) })
    try {
      await client.connect()
      await client.query('LISTEN sqchat_changes')
    } catch (error) {
      await client.end().catch(() => {})
      throw error
    }
  } else if (process.env.VERCEL) {
    throw createError({ statusCode: 503, statusMessage: 'Live chat storage is unavailable.' })
  } else {
    stopLocal = listenForLocalChanges(() => push('change'))
  }

  const heartbeat = setInterval(() => push('heartbeat'), 15000)
  const lifespan = setTimeout(() => { void stream.close().catch(() => {}) }, 240000)
  stream.onClosed(() => {
    closed = true
    clearInterval(heartbeat)
    clearTimeout(lifespan)
    stopLocal?.()
    if (client) void client.end().catch(() => {})
  })
  setTimeout(() => push('ready'), 0)
  return stream.send()
})
