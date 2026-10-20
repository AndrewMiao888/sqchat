import { requireAdmin, rateLimit } from '../utils/auth'
import { store, audit } from '../utils/store'
import { pushUnreadReminder } from '../utils/push'
import { getReminderSettings } from '../utils/reminderSettings'

export default defineEventHandler(async event => {
  const { user } = await requireAdmin(event)
  const input = await readBody(event)
  if (!input || (input.conversation !== null && (typeof input.conversation !== 'string' || input.conversation.length > 100))
    || typeof input.messageId !== 'string' || input.messageId.length < 1 || input.messageId.length > 100
    || typeof input.userId !== 'string' || input.userId.length < 1 || input.userId.length > 100
    || input.userId === user.id) {
    throw createError({ statusCode: 400, statusMessage: 'Choose an unread person in this conversation.' })
  }
  await rateLimit(`reminders:${user.id}`, 20, 60)
  if (!(await getReminderSettings()).manualEnabled) throw createError({ statusCode: 403, statusMessage: 'Manual reminders are turned off.' })
  const db = await store()
  const conversation: string | null = input.conversation
  const rows = conversation
    ? await db`INSERT INTO sq_message_reminders (message_id, user_id)
        SELECT m.id, recipient.id FROM sq_private_messages m JOIN sq_users recipient ON recipient.id = ${input.userId}
        WHERE m.id = ${input.messageId} AND m.thread_id = ${conversation} AND m.sender_id <> recipient.id
          AND recipient.status = 'active'
          AND EXISTS (SELECT 1 FROM sq_thread_members tm WHERE tm.thread_id = m.thread_id AND tm.user_id = recipient.id)
          AND NOT EXISTS (SELECT 1 FROM sq_message_reads r WHERE r.message_id = m.id AND r.user_id = recipient.id)
        ON CONFLICT DO NOTHING RETURNING message_id`
    : await db`INSERT INTO sq_message_reminders (message_id, user_id)
        SELECT m.id, recipient.id FROM chat_messages m JOIN sq_users recipient ON recipient.id = ${input.userId}
        WHERE m.id = ${input.messageId} AND recipient.status = 'active' AND NOT recipient.private_only
          AND (m.sender_id IS DISTINCT FROM recipient.id) AND m.sender <> recipient.name
          AND NOT EXISTS (SELECT 1 FROM sq_message_reads r WHERE r.message_id = m.id AND r.user_id = recipient.id)
        ON CONFLICT DO NOTHING RETURNING message_id`
  if (!rows.length) throw createError({ statusCode: 409, statusMessage: 'This person has read the message or was already reminded.' })
  let sent = false
  try { sent = await pushUnreadReminder(input.userId, conversation, input.messageId) }
  finally {
    if (!sent) await db`DELETE FROM sq_message_reminders WHERE message_id = ${input.messageId} AND user_id = ${input.userId}`
  }
  if (!sent) throw createError({ statusCode: 409, statusMessage: 'No active notification device could receive the reminder.' })
  await audit(user.id, 'message.reminder', `${input.messageId}:${input.userId}`)
  await db`SELECT pg_notify('sqchat_changes', ${JSON.stringify({ conversation, receipt: true, ...(conversation ? { users: [user.id] } : {}) })})`
  return { sent: true }
})
