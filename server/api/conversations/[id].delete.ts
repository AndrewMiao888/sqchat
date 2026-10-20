import { del } from '@vercel/blob'
import { requireAdmin } from '../../utils/auth'
import { store, audit } from '../../utils/store'
import { findThread } from '../../utils/chat'
export default defineEventHandler(async event => {
  const { user } = await requireAdmin(event)
  const id = getRouterParam(event, 'id') || ''
  const db = await store()
  let files: any[]
  if (id === 'shared') {
    const results = await db.transaction([
      db`LOCK TABLE chat_messages IN EXCLUSIVE MODE`,
      db`UPDATE sq_attachments SET status = 'deleted' WHERE thread_id IS NULL AND message_id IN (SELECT id FROM chat_messages) RETURNING blob_path`,
      db`DELETE FROM sq_message_reads WHERE message_id IN (SELECT id FROM chat_messages)`,
      db`DELETE FROM sq_message_reminders WHERE message_id IN (SELECT id FROM chat_messages)`,
      db`DELETE FROM chat_messages`,
      db`SELECT pg_notify('sqchat_changes', 'change')`
    ])
    files = results[1] || []
  } else {
    const thread = await findThread(user, id)
    const results = await db.transaction([
      db`SELECT id FROM sq_threads WHERE id = ${id} FOR UPDATE`,
      db`UPDATE sq_attachments SET status = 'deleted', thread_id = NULL WHERE thread_id = ${id} RETURNING blob_path`,
      db`DELETE FROM sq_message_reads WHERE message_id IN (SELECT id FROM sq_private_messages WHERE thread_id = ${id})`,
      db`DELETE FROM sq_message_reminders WHERE message_id IN (SELECT id FROM sq_private_messages WHERE thread_id = ${id})`,
      db`DELETE FROM sq_private_messages WHERE thread_id = ${id}`,
      db`DELETE FROM sq_thread_members WHERE thread_id = ${id}`,
      db`UPDATE sq_users SET home_thread = NULL WHERE home_thread = ${id}`,
      db`UPDATE sq_users SET last_chat = '' WHERE last_chat = ${id}`,
      db`DELETE FROM sq_chat_requests WHERE thread_id = ${id}`,
      db`DELETE FROM sq_threads WHERE id = ${id}`,
      db`SELECT pg_notify('sqchat_changes', ${JSON.stringify({ users: thread.members.map(member => member.id) })})`
    ])
    files = results[1] || []
  }
  await Promise.allSettled(files.map(file => del(file.blob_path)))
  await audit(user.id, id === 'shared' ? 'conversation.cleared' : 'conversation.deleted', id)
  return { ok: true }
})
