import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { ChatMessage, ChatSettings, ChatState, Person } from '#shared/types/chat'
import { DEFAULT_SETTINGS, PEOPLE } from '#shared/types/chat'

const dataPath = join(process.cwd(), '.data', 'chat.json')
let localQueue: Promise<unknown> = Promise.resolve()
const localRateLimits = new Map<string, number>()
let sql: NeonQueryFunction<false, false> | undefined
let schemaReady: Promise<void> | undefined

async function database() {
  const url = process.env.DATABASE_URL
  if (!url) {
    if (process.env.VERCEL) throw new Error('Chat storage is not configured')
    return null
  }
  sql ||= neon(url)
  if (!schemaReady) {
    schemaReady = Promise.all([
      sql`CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        sender TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        edited_at TIMESTAMPTZ
      )`,
      sql`CREATE TABLE IF NOT EXISTS chat_settings (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE,
        data JSONB NOT NULL
      )`,
      sql`CREATE TABLE IF NOT EXISTS chat_rate_limits (
        ip_hash TEXT PRIMARY KEY,
        blocked_until TIMESTAMPTZ NOT NULL
      )`
    ]).then(() => {}).catch(error => {
      schemaReady = undefined
      throw error
    })
  }
  await schemaReady
  return sql
}

async function readLocal(): Promise<ChatState> {
  try {
    const raw = JSON.parse(await readFile(dataPath, 'utf8')) as Partial<ChatState>
    return {
      messages: Array.isArray(raw.messages) ? raw.messages : [],
      settings: { ...DEFAULT_SETTINGS, ...raw.settings }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return { messages: [], settings: { ...DEFAULT_SETTINGS } }
  }
}

async function mutateLocal<T>(change: (state: ChatState) => T | Promise<T>): Promise<T> {
  const operation = localQueue.then(async () => {
    const state = await readLocal()
    const result = await change(state)
    await mkdir(join(process.cwd(), '.data'), { recursive: true })
    await writeFile(dataPath, JSON.stringify(state, null, 2), 'utf8')
    return result
  })
  localQueue = operation.catch(() => {})
  return operation
}

function toMessage(row: any): ChatMessage {
  return {
    id: row.id,
    sender: row.sender,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.edited_at ? { editedAt: new Date(row.edited_at).toISOString() } : {})
  }
}

export function validPerson(value: unknown): value is Person {
  return typeof value === 'string' && PEOPLE.includes(value as Person)
}

export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\r\n?/g, '\n').trim()
  if (!text || text.length > max) return null
  return text
}

export async function getChatState(): Promise<ChatState> {
  const db = await database()
  if (!db) return readLocal()
  const [messages, savedSettings] = await Promise.all([
    db`SELECT id, sender, body, created_at, edited_at FROM (
      SELECT * FROM chat_messages ORDER BY created_at DESC, id DESC LIMIT 200
    ) recent ORDER BY created_at ASC, id ASC`,
    db`SELECT data FROM chat_settings WHERE id = TRUE`
  ])
  return {
    messages: messages.map(toMessage),
    settings: { ...DEFAULT_SETTINGS, ...(savedSettings[0]?.data || {}) }
  }
}

export async function addMessage(sender: Person, body: string): Promise<ChatMessage> {
  const message: ChatMessage = { id: randomUUID(), sender, body, createdAt: new Date().toISOString() }
  const db = await database()
  if (db) {
    const rows = await db`INSERT INTO chat_messages (id, sender, body, created_at)
      VALUES (${message.id}, ${sender}, ${body}, ${message.createdAt})
      RETURNING id, sender, body, created_at, edited_at`
    return toMessage(rows[0])
  }
  return mutateLocal(state => {
    state.messages.push(message)
    state.messages = state.messages.slice(-200)
    return message
  })
}

export async function updateMessage(id: string, body: string): Promise<ChatMessage | null> {
  const db = await database()
  if (db) {
    const rows = await db`UPDATE chat_messages SET body = ${body}, edited_at = NOW()
      WHERE id = ${id} RETURNING id, sender, body, created_at, edited_at`
    return rows[0] ? toMessage(rows[0]) : null
  }
  return mutateLocal(state => {
    const message = state.messages.find(item => item.id === id)
    if (!message) return null
    message.body = body
    message.editedAt = new Date().toISOString()
    return message
  })
}

export async function deleteMessage(id: string): Promise<boolean> {
  const db = await database()
  if (db) {
    const rows = await db`DELETE FROM chat_messages WHERE id = ${id} RETURNING id`
    return rows.length > 0
  }
  return mutateLocal(state => {
    const length = state.messages.length
    state.messages = state.messages.filter(message => message.id !== id)
    return state.messages.length !== length
  })
}

export async function updateSettings(settings: ChatSettings): Promise<ChatSettings> {
  const db = await database()
  if (db) {
    await db`INSERT INTO chat_settings (id, data) VALUES (TRUE, ${JSON.stringify(settings)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`
    return settings
  }
  return mutateLocal(state => {
    state.settings = settings
    return settings
  })
}

export async function allowMessage(ip: string): Promise<boolean> {
  const db = await database()
  if (db) {
    const hash = createHash('sha256').update(ip).digest('hex')
    const rows = await db`INSERT INTO chat_rate_limits (ip_hash, blocked_until)
      VALUES (${hash}, NOW() + INTERVAL '2 seconds')
      ON CONFLICT (ip_hash) DO UPDATE SET blocked_until = EXCLUDED.blocked_until
      WHERE chat_rate_limits.blocked_until < NOW() RETURNING ip_hash`
    return rows.length > 0
  }
  const now = Date.now()
  if ((localRateLimits.get(ip) || 0) > now) return false
  localRateLimits.set(ip, now + 2000)
  return true
}
