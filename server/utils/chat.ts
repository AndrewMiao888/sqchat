import { randomUUID } from 'node:crypto'
import { store, signal } from './store'
import type { Account, Conversation } from '#shared/types/auth'
import { DEFAULT_SETTINGS, type ChatMessage, type ChatSettings, type ChatState } from '#shared/types/chat'

export function normalizePersonName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.normalize('NFKC').replace(/\s+/g, ' ').trim()
  return name.length <= 24 && /^\p{L}[\p{L}\p{M}\p{N} .'-]*$/u.test(name) ? name : null
}
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\r\n?/g, '\n').trim()
  return text && text.length <= max ? text : null
}
function toMessage(row: any): ChatMessage {
  return { id: row.id, sender: row.sender, body: row.body, createdAt: new Date(row.created_at).toISOString(),
    ...(row.edited_at ? { editedAt: new Date(row.edited_at).toISOString() } : {}) }
}
function toThread(row: any): Conversation {
  return { id: row.id, title: row.title, members: row.members }
}
export async function findThread(user: Account, id: string, writing = false) {
  const db = await store()
  const rows = await db`SELECT t.*, json_agg(json_build_object('id', u.id, 'name', u.name, 'active', u.status = 'active') ORDER BY m.joined_at, u.name) AS members
    FROM sq_threads t JOIN sq_thread_members m ON m.thread_id = t.id JOIN sq_users u ON u.id = m.user_id
    WHERE t.id = ${id} AND (${user.role === 'admin'} OR EXISTS (
      SELECT 1 FROM sq_thread_members own WHERE own.thread_id = t.id AND own.user_id = ${user.id}
    )) GROUP BY t.id`
  const row = rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Conversation not found.' })
  const canSend = row.members.some((member: any) => member.id === user.id && member.active) && row.members.filter((member: any) => member.active).length >= 2
  if (writing && !canSend) throw createError({ statusCode: 403, statusMessage: 'Only active participants can send messages in this conversation.' })
  return { ...toThread(row), canSend }
}
export async function notifyThread(id: string) {
  const db = await store()
  const rows = await db`SELECT user_id FROM sq_thread_members WHERE thread_id = ${id}`
  if (rows.length) await signal(rows.map(row => row.user_id))
}
export async function getChatState(user: Account, conversation: string | null = null): Promise<ChatState> {
  const db = await store()
  const thread = conversation ? await findThread(user, conversation) : null
  const [messages, settings, members, threads] = await Promise.all([
    thread ? db`SELECT m.*, u.name AS sender FROM (
      SELECT * FROM sq_private_messages WHERE thread_id = ${thread.id} ORDER BY created_at DESC, id DESC LIMIT 200
    ) m JOIN sq_users u ON u.id = m.sender_id ORDER BY m.created_at, m.id`
      : db`SELECT * FROM (SELECT * FROM chat_messages ORDER BY created_at DESC, id DESC LIMIT 200) m ORDER BY created_at, id`,
    db`SELECT data FROM chat_settings WHERE id = TRUE`,
    db`SELECT id, name FROM sq_users WHERE status = 'active' ORDER BY builtin DESC, created_at, name`,
    db`SELECT t.*, json_agg(json_build_object('id', u.id, 'name', u.name, 'active', u.status = 'active') ORDER BY m.joined_at, u.name) AS members
      FROM sq_threads t JOIN sq_thread_members m ON m.thread_id = t.id JOIN sq_users u ON u.id = m.user_id
      WHERE ${user.role === 'admin'} OR EXISTS (SELECT 1 FROM sq_thread_members own WHERE own.thread_id = t.id AND own.user_id = ${user.id})
      GROUP BY t.id ORDER BY t.created_at DESC`
  ])
  return { messages: messages.map(toMessage), settings: { ...DEFAULT_SETTINGS, ...(settings[0]?.data || {}) },
    people: members.map(row => row.name), members: members.map(row => ({ id: row.id, name: row.name })),
    conversations: threads.map(toThread), conversation, canSend: thread ? thread.canSend : true }
}
export async function addMessage(user: Account, body: string, conversation: string | null) {
  const db = await store()
  const id = randomUUID()
  if (conversation) {
    await findThread(user, conversation, true)
    await db`WITH changed AS (
      INSERT INTO sq_private_messages (id, thread_id, sender_id, body) VALUES (${id}, ${conversation}, ${user.id}, ${body}) RETURNING thread_id
    ) SELECT pg_notify('sqchat_changes', json_build_object('users', array_agg(m.user_id))::text)
      FROM changed JOIN sq_thread_members m ON m.thread_id = changed.thread_id`
  } else {
    await db`WITH changed AS (
      INSERT INTO chat_messages (id, sender, body) VALUES (${id}, ${user.name}, ${body}) RETURNING id
    ) SELECT pg_notify('sqchat_changes', 'change') FROM changed`
  }
  return { id }
}
export async function updateMessage(id: string, body: string) {
  const db = await store()
  const rows = await db`WITH changed AS (
    UPDATE chat_messages SET body = ${body}, edited_at = NOW() WHERE id = ${id} RETURNING id
  ), signal AS (SELECT pg_notify('sqchat_changes', 'change') FROM changed) SELECT changed.id FROM changed CROSS JOIN signal`
  if (rows.length) return { id }
  const privateRows = await db`WITH changed AS (
    UPDATE sq_private_messages SET body = ${body}, edited_at = NOW() WHERE id = ${id} RETURNING id, thread_id
  ), signal AS (
    SELECT pg_notify('sqchat_changes', json_build_object('users', array_agg(m.user_id))::text)
    FROM changed JOIN sq_thread_members m ON m.thread_id = changed.thread_id HAVING COUNT(*) > 0
  ) SELECT changed.id FROM changed CROSS JOIN signal`
  return privateRows[0] ? { id } : null
}
export async function deleteMessage(id: string) {
  const db = await store()
  const rows = await db`WITH changed AS (DELETE FROM chat_messages WHERE id = ${id} RETURNING id),
    signal AS (SELECT pg_notify('sqchat_changes', 'change') FROM changed) SELECT changed.id FROM changed CROSS JOIN signal`
  if (rows.length) return true
  const privateRows = await db`WITH changed AS (DELETE FROM sq_private_messages WHERE id = ${id} RETURNING id, thread_id),
    signal AS (SELECT pg_notify('sqchat_changes', json_build_object('users', array_agg(m.user_id))::text)
      FROM changed JOIN sq_thread_members m ON m.thread_id = changed.thread_id HAVING COUNT(*) > 0)
    SELECT changed.id FROM changed CROSS JOIN signal`
  return !!privateRows.length
}
export async function updateSettings(settings: ChatSettings) {
  const db = await store()
  await db`WITH changed AS (
    INSERT INTO chat_settings (id, data) VALUES (TRUE, ${JSON.stringify(settings)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data RETURNING id
  ) SELECT pg_notify('sqchat_changes', 'change') FROM changed`
  return settings
}
