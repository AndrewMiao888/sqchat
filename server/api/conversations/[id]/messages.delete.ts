import { del } from '@vercel/blob'
import { requireAdmin } from '../../../utils/auth'
import { store, audit } from '../../../utils/store'
import { findThread } from '../../../utils/chat'

export default defineEventHandler(async event => {
  const { user } = await requireAdmin(event)
  const id = getRouterParam(event, 'id') || ''
  const thread = await findThread(user, id)
  const db = await store()
  const results = await db.transaction([
    db`LOCK TABLE sq_private_messages IN EXCLUSIVE MODE`,
    db`SELECT id FROM sq_threads WHERE id = ${id} FOR UPDATE`,
    db`UPDATE sq_attachments SET status = 'deleted'
      WHERE thread_id = ${id} AND purpose = 'message' AND status <> 'purged'
        AND message_id IN (SELECT id FROM sq_private_messages WHERE thread_id = ${id})
      RETURNING blob_path`,
    db`DELETE FROM sq_message_reads WHERE message_id IN (SELECT id FROM sq_private_messages WHERE thread_id = ${id})`,
    db`DELETE FROM sq_message_reminders WHERE message_id IN (SELECT id FROM sq_private_messages WHERE thread_id = ${id})`,
    db`DELETE FROM sq_message_reactions WHERE message_id IN (SELECT id FROM sq_private_messages WHERE thread_id = ${id})`,
    db`DELETE FROM sq_private_messages WHERE thread_id = ${id}`,
    db`SELECT pg_notify('sqchat_changes', ${JSON.stringify({ users: thread.members.map(member => member.id), conversation: id })})`
  ])

  const files = results[2] || []
  await Promise.allSettled(files.map(file => del(file.blob_path)))
  await audit(user.id, 'conversation.messages.cleared', id)
  return { ok: true }
})
