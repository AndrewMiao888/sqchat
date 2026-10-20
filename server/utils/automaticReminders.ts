import { store, audit, signal } from './store'
import { getStoredReminderSettings } from './reminderSettings'
import { pushUnreadReminder } from './push'

export async function dispatchDueReminders() {
  const settings = await getStoredReminderSettings()
  if (!settings.automaticAfterMinutes || !settings.automaticSince) return 0
  const db = await store()
  const candidates = await db`SELECT message_id, user_id, conversation FROM (
    SELECT m.id AS message_id, recipient.id AS user_id, NULL::text AS conversation, m.created_at
    FROM chat_messages m CROSS JOIN sq_users recipient
    WHERE m.created_at >= ${settings.automaticSince}::timestamptz
      AND m.created_at <= NOW() - (${settings.automaticAfterMinutes} * INTERVAL '1 minute')
      AND recipient.status = 'active' AND NOT recipient.private_only
      AND m.sender_id IS DISTINCT FROM recipient.id AND m.sender <> recipient.name
      AND NOT EXISTS (SELECT 1 FROM sq_message_reads r WHERE r.message_id = m.id AND r.user_id = recipient.id)
      AND NOT EXISTS (SELECT 1 FROM sq_message_reminders n WHERE n.message_id = m.id AND n.user_id = recipient.id)
      AND EXISTS (SELECT 1 FROM sq_push p JOIN sq_sessions s ON s.token_hash = p.session_hash
        WHERE s.user_id = recipient.id AND s.session_version = recipient.session_version
          AND s.expires_at > NOW() AND s.last_seen > NOW() - INTERVAL '365 days')
    UNION ALL
    SELECT m.id AS message_id, recipient.id AS user_id, m.thread_id AS conversation, m.created_at
    FROM sq_private_messages m JOIN sq_thread_members tm ON tm.thread_id = m.thread_id
      JOIN sq_users recipient ON recipient.id = tm.user_id
    WHERE m.created_at >= ${settings.automaticSince}::timestamptz
      AND m.created_at <= NOW() - (${settings.automaticAfterMinutes} * INTERVAL '1 minute')
      AND recipient.status = 'active' AND m.sender_id <> recipient.id
      AND NOT EXISTS (SELECT 1 FROM sq_message_reads r WHERE r.message_id = m.id AND r.user_id = recipient.id)
      AND NOT EXISTS (SELECT 1 FROM sq_message_reminders n WHERE n.message_id = m.id AND n.user_id = recipient.id)
      AND EXISTS (SELECT 1 FROM sq_push p JOIN sq_sessions s ON s.token_hash = p.session_hash
        WHERE s.user_id = recipient.id AND s.session_version = recipient.session_version
          AND s.expires_at > NOW() AND s.last_seen > NOW() - INTERVAL '365 days')
  ) due ORDER BY created_at, message_id LIMIT 20`
  let sent = 0
  await Promise.all(candidates.map(async row => {
    const claimed = row.conversation
      ? await db`INSERT INTO sq_message_reminders (message_id, user_id)
          SELECT m.id, recipient.id FROM sq_private_messages m JOIN sq_users recipient ON recipient.id = ${row.user_id}
          WHERE m.id = ${row.message_id} AND m.thread_id = ${row.conversation} AND m.sender_id <> recipient.id
            AND recipient.status = 'active'
            AND EXISTS (SELECT 1 FROM sq_thread_members tm WHERE tm.thread_id = m.thread_id AND tm.user_id = recipient.id)
            AND NOT EXISTS (SELECT 1 FROM sq_message_reads r WHERE r.message_id = m.id AND r.user_id = recipient.id)
          ON CONFLICT DO NOTHING RETURNING message_id`
      : await db`INSERT INTO sq_message_reminders (message_id, user_id)
          SELECT m.id, recipient.id FROM chat_messages m JOIN sq_users recipient ON recipient.id = ${row.user_id}
          WHERE m.id = ${row.message_id} AND recipient.status = 'active' AND NOT recipient.private_only
            AND m.sender_id IS DISTINCT FROM recipient.id AND m.sender <> recipient.name
            AND NOT EXISTS (SELECT 1 FROM sq_message_reads r WHERE r.message_id = m.id AND r.user_id = recipient.id)
          ON CONFLICT DO NOTHING RETURNING message_id`
    if (!claimed.length) return
    let delivered = false
    try { delivered = await pushUnreadReminder(row.user_id, row.conversation, row.message_id) }
    finally {
      if (!delivered) await db`DELETE FROM sq_message_reminders WHERE message_id = ${row.message_id} AND user_id = ${row.user_id}`
    }
    if (delivered) {
      sent++
      await audit(null, 'message.reminder.auto', `${row.message_id}:${row.user_id}`)
    }
  }))
  if (sent) await signal()
  return sent
}
