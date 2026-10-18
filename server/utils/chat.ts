import { randomUUID } from 'node:crypto'
import { del } from '@vercel/blob'
import type { MessageEffects } from '#shared/types/media'
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
  return { id: row.id, sender: row.sender, body: row.body, effects: row.effects || {}, createdAt: new Date(row.created_at).toISOString(),
    ...(row.edited_at ? { editedAt: new Date(row.edited_at).toISOString() } : {}) }
}
function toThread(row: any): Conversation {
  return { id: row.id, title: row.title, members: row.members }
}
export async function findThread(user: Account, id: string, writing = false) {
  const db = await store()
  const rows = await db`SELECT t.*, COALESCE(json_agg(json_build_object('id', u.id, 'name', u.name, 'active', u.status = 'active') ORDER BY m.joined_at, u.name) FILTER (WHERE u.id IS NOT NULL), '[]'::json) AS members
    FROM sq_threads t LEFT JOIN sq_thread_members m ON m.thread_id = t.id LEFT JOIN sq_users u ON u.id = m.user_id
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
function canOwnMessage(row: any, user: Account, conversation: string | null) {
  return row.sender_id ? row.sender_id === user.id : !conversation && row.sender === user.name
}
export async function getChatState(user: Account, conversation: string | null = null, before: { at: string; id: string } | null = null): Promise<ChatState> {
  const db = await store()
  const thread = conversation ? await findThread(user, conversation) : null
  const [rows, settings, members, threads] = await Promise.all([
    thread ? db`SELECT m.*, m.created_at::text AS cursor_at, u.name AS sender FROM (
      SELECT * FROM sq_private_messages WHERE thread_id = ${thread.id} AND (${!before} OR (created_at, id) < (${before?.at || '9999-12-31'}::timestamptz, ${before?.id || ''})) ORDER BY created_at DESC, id DESC LIMIT 201
    ) m JOIN sq_users u ON u.id = m.sender_id ORDER BY m.created_at, m.id`
      : user.privateOnly ? Promise.resolve([]) : db`SELECT m.*, m.created_at::text AS cursor_at FROM (SELECT * FROM chat_messages WHERE ${!before} OR (created_at, id) < (${before?.at || '9999-12-31'}::timestamptz, ${before?.id || ''}) ORDER BY created_at DESC, id DESC LIMIT 201) m ORDER BY created_at, id`,
    db`SELECT data FROM chat_settings WHERE id = TRUE`,
    db`SELECT id, name, private_only FROM sq_users WHERE status = 'active' ORDER BY builtin DESC, created_at, name`,
    db`SELECT t.*, COALESCE(json_agg(json_build_object('id', u.id, 'name', u.name, 'active', u.status = 'active') ORDER BY m.joined_at, u.name) FILTER (WHERE u.id IS NOT NULL), '[]'::json) AS members
      FROM sq_threads t LEFT JOIN sq_thread_members m ON m.thread_id = t.id LEFT JOIN sq_users u ON u.id = m.user_id
      WHERE ${user.role === 'admin'} OR EXISTS (SELECT 1 FROM sq_thread_members own WHERE own.thread_id = t.id AND own.user_id = ${user.id})
      GROUP BY t.id ORDER BY t.created_at DESC`
  ])
  const messages = rows.slice(-200)
  const nextCursor = messages[0] ? Buffer.from(JSON.stringify({ at: messages[0].cursor_at, id: messages[0].id })).toString('base64url') : null
  const files = messages.length ? await db`SELECT id, message_id, name, content_type, size FROM sq_attachments
    WHERE message_id = ANY(${messages.map(row => row.id)}::text[]) AND status = 'attached' ORDER BY created_at, id` : []
  const replyIds = messages.map(row => row.reply_to).filter(Boolean)
  const originals = !replyIds.length ? [] : conversation
    ? await db`SELECT m.id, m.body, m.effects, u.name AS sender FROM sq_private_messages m JOIN sq_users u ON u.id = m.sender_id WHERE m.thread_id = ${conversation} AND m.id = ANY(${replyIds}::text[])`
    : await db`SELECT id, body, effects, sender FROM chat_messages WHERE id = ANY(${replyIds}::text[])`
  return { messages: messages.map(row => {
    const original = originals.find(parent => parent.id === row.reply_to)
    const replyTo = !row.reply_to ? undefined : original ? { id: original.id, sender: original.sender, body: original.effects?.bubble === 'invisible' ? 'Invisible ink message' : original.body.slice(0, 240) || 'Attachment' } : { id: row.reply_to, sender: '', body: 'Original message deleted', deleted: true }
      const ownsMessage = canOwnMessage(row, user, conversation)
      return { ...toMessage(row), canDelete: user.role === 'admin' || ownsMessage, canEdit: user.role === 'admin' || ownsMessage, ...(replyTo ? { replyTo } : {}), attachments: files.filter(file => file.message_id === row.id).map(file => ({ id: file.id, name: file.name, type: file.content_type, size: Number(file.size) })) }
  }), settings: { ...DEFAULT_SETTINGS, ...(settings[0]?.data || {}) },
    people: user.privateOnly ? [] : members.filter(row => !row.private_only).map(row => row.name), members: members.map(row => ({ id: row.id, name: row.name, sharedAllowed: !row.private_only })),
    conversations: threads.map(toThread), conversation, hasMore: rows.length > 200, nextCursor, canSend: thread ? thread.canSend : !user.privateOnly }
}
export async function addMessage(user: Account, body: string, conversation: string | null, effects: MessageEffects = {}, attachments: string[] = [], replyTo: string | null = null) {
  if (!conversation && user.privateOnly) throw createError({ statusCode: 403, statusMessage: 'This account uses private conversations only.' })
  const db = await store()
  if (conversation) await findThread(user, conversation, true)
  if (replyTo) {
    const parent = conversation ? await db`SELECT id FROM sq_private_messages WHERE id = ${replyTo} AND thread_id = ${conversation}` : await db`SELECT id FROM chat_messages WHERE id = ${replyTo}`
    if (!parent.length) throw createError({ statusCode: 400, statusMessage: 'The message you are replying to is no longer in this conversation.' })
  }
  const id = randomUUID()
  let rows: any[]
  if (conversation) {
    rows = await db`WITH valid AS (
      SELECT id FROM sq_attachments WHERE id = ANY(${attachments}::text[]) AND owner_id = ${user.id}
        AND thread_id = ${conversation} AND status = 'ready' AND message_id IS NULL FOR UPDATE
    ), changed AS (
      INSERT INTO sq_private_messages (id, thread_id, sender_id, body, effects, reply_to)
      SELECT ${id}, ${conversation}, ${user.id}, ${body}, ${JSON.stringify(effects)}::jsonb, ${replyTo} WHERE (SELECT COUNT(*) FROM valid) = ${attachments.length} RETURNING id, thread_id
    ), linked AS (UPDATE sq_attachments SET message_id = ${id}, status = 'attached' WHERE id IN (SELECT id FROM valid) AND EXISTS (SELECT 1 FROM changed)),
    signal AS (SELECT pg_notify('sqchat_changes', json_build_object('users', array_agg(m.user_id), 'conversation', ${conversation}::text)::text)
      FROM changed JOIN sq_thread_members m ON m.thread_id = changed.thread_id HAVING COUNT(*) > 0)
    SELECT changed.id FROM changed CROSS JOIN signal`
  } else {
    rows = await db`WITH valid AS (
      SELECT id FROM sq_attachments WHERE id = ANY(${attachments}::text[]) AND owner_id = ${user.id}
        AND thread_id IS NULL AND status = 'ready' AND message_id IS NULL FOR UPDATE
    ), changed AS (
      INSERT INTO chat_messages (id, sender, sender_id, body, effects, reply_to) SELECT ${id}, ${user.name}, ${user.id}, ${body}, ${JSON.stringify(effects)}::jsonb, ${replyTo}
      WHERE (SELECT COUNT(*) FROM valid) = ${attachments.length} RETURNING id
    ), linked AS (UPDATE sq_attachments SET message_id = ${id}, status = 'attached' WHERE id IN (SELECT id FROM valid) AND EXISTS (SELECT 1 FROM changed)),
    signal AS (SELECT pg_notify('sqchat_changes', json_build_object('conversation', NULL)::text) FROM changed) SELECT changed.id FROM changed CROSS JOIN signal`
  }
  if (!rows.length) throw createError({ statusCode: 409, statusMessage: 'One of these files is not ready, belongs to another chat, or has already been sent.' })
  return { id }
}
export async function updateMessage(id: string, body: string, user: Account) {
  const db = await store()
  const rows = await db`WITH changed AS (
    UPDATE chat_messages SET body = ${body}, edited_at = NOW(), effects = effects - 'text' WHERE id = ${id}
    AND (${user.role === 'admin'} OR (${!user.privateOnly} AND (sender_id = ${user.id} OR (sender_id IS NULL AND sender = ${user.name})))) RETURNING id
  ), signal AS (SELECT pg_notify('sqchat_changes', 'change') FROM changed) SELECT changed.id FROM changed CROSS JOIN signal`
  if (rows.length) return { id }
  const privateRows = await db`WITH changed AS (
    UPDATE sq_private_messages SET body = ${body}, edited_at = NOW(), effects = effects - 'text' WHERE id = ${id}
    AND (${user.role === 'admin'} OR (sender_id = ${user.id} AND EXISTS (
      SELECT 1 FROM sq_thread_members m WHERE m.thread_id = sq_private_messages.thread_id AND m.user_id = ${user.id}
    ))) RETURNING id, thread_id
  ), signal AS (
    SELECT pg_notify('sqchat_changes', json_build_object('users', array_agg(m.user_id))::text)
    FROM changed JOIN sq_thread_members m ON m.thread_id = changed.thread_id HAVING COUNT(*) > 0
  ) SELECT changed.id FROM changed CROSS JOIN signal`
  return privateRows[0] ? { id } : null
}
export async function deleteMessage(id: string, user: Account) {
  const db = await store()
  const rows = await db`WITH changed AS (DELETE FROM chat_messages WHERE id = ${id}
    AND (${user.role === 'admin'} OR (${!user.privateOnly} AND (sender_id = ${user.id} OR (sender_id IS NULL AND sender = ${user.name})))) RETURNING id),
    signal AS (SELECT pg_notify('sqchat_changes', 'change') FROM changed) SELECT changed.id FROM changed CROSS JOIN signal`
  if (rows.length) { await deleteMessageFiles(id); return true }
  const privateRows = await db`WITH changed AS (DELETE FROM sq_private_messages WHERE id = ${id}
    AND (${user.role === 'admin'} OR (sender_id = ${user.id} AND EXISTS (
      SELECT 1 FROM sq_thread_members m WHERE m.thread_id = sq_private_messages.thread_id AND m.user_id = ${user.id}
    ))) RETURNING id, thread_id),
    signal AS (SELECT pg_notify('sqchat_changes', json_build_object('users', array_agg(m.user_id))::text)
      FROM changed JOIN sq_thread_members m ON m.thread_id = changed.thread_id HAVING COUNT(*) > 0)
    SELECT changed.id FROM changed CROSS JOIN signal`
  if (privateRows.length) await deleteMessageFiles(id)
  return !!privateRows.length
}
async function deleteMessageFiles(id: string) {
  const db = await store()
  const files = await db`UPDATE sq_attachments SET status = 'deleted' WHERE message_id = ${id} RETURNING blob_path`
  await Promise.allSettled(files.map(file => del(file.blob_path)))
}
export async function updateSettings(settings: ChatSettings) {
  const db = await store()
  await db`WITH changed AS (
    INSERT INTO chat_settings (id, data) VALUES (TRUE, ${JSON.stringify(settings)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data RETURNING id
  ) SELECT pg_notify('sqchat_changes', 'change') FROM changed`
  return settings
}
