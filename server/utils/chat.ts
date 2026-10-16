import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { ChatMessage, ChatSettings, ChatState, Person } from '#shared/types/chat'
import { DEFAULT_SETTINGS, PEOPLE } from '#shared/types/chat'
import { publishLocalChange } from './realtime'

const dataPath = join(process.cwd(), '.data', 'chat.json')
let localQueue: Promise<unknown> = Promise.resolve()
const localRateLimits = new Map<string, number>()
const maxExtraPeople = 20
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
      )`,
      sql`CREATE TABLE IF NOT EXISTS chat_people (
        name_key TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      people: [...PEOPLE, ...(Array.isArray(raw.people) ? raw.people.filter(name => typeof name === 'string' && !PEOPLE.some(defaultName => defaultName.toLowerCase() === name.toLowerCase())) : [])],
      settings: { ...DEFAULT_SETTINGS, ...raw.settings }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return { messages: [], people: [...PEOPLE], settings: { ...DEFAULT_SETTINGS } }
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

export function normalizePersonName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.normalize('NFKC').replace(/\s+/g, ' ').trim()
  return name.length <= 24 && /^\p{L}[\p{L}\p{M}\p{N} .'-]*$/u.test(name) ? name : null
}

function isDefaultPerson(name: string): boolean {
  return PEOPLE.some(person => person.toLowerCase() === name.toLowerCase())
}

export async function personExists(name: string): Promise<boolean> {
  if (PEOPLE.includes(name as (typeof PEOPLE)[number])) return true
  const db = await database()
  if (db) {
    const rows = await db`SELECT name FROM chat_people WHERE name = ${name} LIMIT 1`
    return rows.length > 0
  }
  return (await readLocal()).people.includes(name)
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
  const [messages, savedSettings, extraPeople] = await Promise.all([
    db`SELECT id, sender, body, created_at, edited_at FROM (
      SELECT * FROM chat_messages ORDER BY created_at DESC, id DESC LIMIT 200
    ) recent ORDER BY created_at ASC, id ASC`,
    db`SELECT data FROM chat_settings WHERE id = TRUE`,
    db`SELECT name FROM chat_people ORDER BY created_at ASC, name ASC`
  ])
  return {
    messages: messages.map(toMessage),
    people: [...PEOPLE, ...extraPeople.map(row => row.name)],
    settings: { ...DEFAULT_SETTINGS, ...(savedSettings[0]?.data || {}) }
  }
}

export async function addPerson(name: string): Promise<'added' | 'duplicate' | 'full'> {
  const key = name.toLowerCase()
  if (isDefaultPerson(name)) return 'duplicate'
  const db = await database()
  if (db) {
    const current = await db`SELECT name_key FROM chat_people`
    if (current.some(row => row.name_key === key)) return 'duplicate'
    if (current.length >= maxExtraPeople) return 'full'
    const rows = await db`WITH changed AS (
      INSERT INTO chat_people (name_key, name) VALUES (${key}, ${name})
      ON CONFLICT (name_key) DO NOTHING RETURNING name
    ), signal AS (SELECT pg_notify('sqchat_changes', 'change') FROM changed)
    SELECT changed.name FROM changed CROSS JOIN signal`
    return rows.length ? 'added' : 'duplicate'
  }
  const result = await mutateLocal(state => {
    if (state.people.some(person => person.toLowerCase() === key)) return 'duplicate'
    if (state.people.length - PEOPLE.length >= maxExtraPeople) return 'full'
    state.people.push(name)
    return 'added'
  })
  if (result === 'added') publishLocalChange()
  return result
}

export async function deletePerson(name: string): Promise<boolean> {
  if (isDefaultPerson(name)) return false
  const key = name.toLowerCase()
  const db = await database()
  if (db) {
    const rows = await db`WITH changed AS (
      DELETE FROM chat_people WHERE name_key = ${key} RETURNING name
    ), signal AS (SELECT pg_notify('sqchat_changes', 'change') FROM changed)
    SELECT changed.name FROM changed CROSS JOIN signal`
    return rows.length > 0
  }
  const removed = await mutateLocal(state => {
    const length = state.people.length
    state.people = state.people.filter(person => person.toLowerCase() !== key)
    return state.people.length !== length
  })
  if (removed) publishLocalChange()
  return removed
}

export async function resetPeople(): Promise<number> {
  const db = await database()
  if (db) {
    const rows = await db`WITH changed AS (
      DELETE FROM chat_people RETURNING name
    ), signal AS (SELECT pg_notify('sqchat_changes', 'change') FROM changed LIMIT 1)
    SELECT COUNT(changed.name)::int AS removed FROM changed CROSS JOIN signal`
    return Number(rows[0]?.removed || 0)
  }
  const removed = await mutateLocal(state => {
    const count = state.people.length - PEOPLE.length
    state.people = [...PEOPLE]
    return count
  })
  if (removed) publishLocalChange()
  return removed
}

export async function addMessage(sender: Person, body: string): Promise<ChatMessage> {
  const message: ChatMessage = { id: randomUUID(), sender, body, createdAt: new Date().toISOString() }
  const db = await database()
  if (db) {
    const rows = await db`WITH changed AS (
      INSERT INTO chat_messages (id, sender, body, created_at)
      VALUES (${message.id}, ${sender}, ${body}, ${message.createdAt})
      RETURNING id, sender, body, created_at, edited_at
    ), signal AS (SELECT pg_notify('sqchat_changes', 'change') FROM changed)
    SELECT changed.* FROM changed CROSS JOIN signal`
    return toMessage(rows[0])
  }
  const saved = await mutateLocal(state => {
    state.messages.push(message)
    state.messages = state.messages.slice(-200)
    return message
  })
  publishLocalChange()
  return saved
}

export async function updateMessage(id: string, body: string): Promise<ChatMessage | null> {
  const db = await database()
  if (db) {
    const rows = await db`WITH changed AS (
      UPDATE chat_messages SET body = ${body}, edited_at = NOW()
      WHERE id = ${id} RETURNING id, sender, body, created_at, edited_at
    ), signal AS (SELECT pg_notify('sqchat_changes', 'change') FROM changed)
    SELECT changed.* FROM changed CROSS JOIN signal`
    return rows[0] ? toMessage(rows[0]) : null
  }
  const saved = await mutateLocal(state => {
    const message = state.messages.find(item => item.id === id)
    if (!message) return null
    message.body = body
    message.editedAt = new Date().toISOString()
    return message
  })
  if (saved) publishLocalChange()
  return saved
}

export async function deleteMessage(id: string): Promise<boolean> {
  const db = await database()
  if (db) {
    const rows = await db`WITH changed AS (
      DELETE FROM chat_messages WHERE id = ${id} RETURNING id
    ), signal AS (SELECT pg_notify('sqchat_changes', 'change') FROM changed)
    SELECT changed.id FROM changed CROSS JOIN signal`
    return rows.length > 0
  }
  const removed = await mutateLocal(state => {
    const length = state.messages.length
    state.messages = state.messages.filter(message => message.id !== id)
    return state.messages.length !== length
  })
  if (removed) publishLocalChange()
  return removed
}

export async function updateSettings(settings: ChatSettings): Promise<ChatSettings> {
  const db = await database()
  if (db) {
    await db`WITH changed AS (
      INSERT INTO chat_settings (id, data) VALUES (TRUE, ${JSON.stringify(settings)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data RETURNING id
    ) SELECT pg_notify('sqchat_changes', 'change') FROM changed`
    return settings
  }
  const saved = await mutateLocal(state => {
    state.settings = settings
    return settings
  })
  publishLocalChange()
  return saved
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
