import webpush from 'web-push'
import { store } from './store'
import { messageNotification } from './notificationText'

// Kept in the server-only database so deployments share the same signing keys.
export async function pushKeys() {
  const db = await store()
  let rows = await db`SELECT value FROM sq_config WHERE key = 'push_vapid'`
  if (!rows.length) {
    await db`INSERT INTO sq_config (key, value) VALUES ('push_vapid', ${JSON.stringify(webpush.generateVAPIDKeys())}) ON CONFLICT DO NOTHING`
    rows = await db`SELECT value FROM sq_config WHERE key = 'push_vapid'`
  }
  return JSON.parse(rows[0]!.value) as { publicKey: string; privateKey: string }
}

export function validSubscription(input: any): input is webpush.PushSubscription {
  try {
    if (typeof input?.endpoint !== 'string' || input.endpoint.length > 2048) return false
    const url = new URL(input.endpoint)
    // Restrict outbound requests to browser push providers, never arbitrary client URLs.
    const allowed = url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com'
      || url.hostname === 'web.push.apple.com' || url.hostname.endsWith('.push.apple.com')
      || url.hostname.endsWith('.notify.windows.com')
    return allowed && url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash
      && /^[A-Za-z0-9_-]{87}$/.test(input.keys?.p256dh) && /^[A-Za-z0-9_-]{22}$/.test(input.keys?.auth)
  } catch { return false }
}

export async function pushMessage(senderId: string, conversation: string | null, messageId: string) {
  const db = await store()
  const rows = await db`SELECT p.endpoint, p.subscription FROM sq_push p
    JOIN sq_sessions s ON s.token_hash = p.session_hash JOIN sq_users u ON u.id = s.user_id
    WHERE u.id <> ${senderId} AND u.status = 'active' AND s.session_version = u.session_version
      AND s.expires_at > NOW() AND s.last_seen > NOW() - INTERVAL '365 days'
      AND ((${conversation}::text IS NULL AND NOT u.private_only) OR EXISTS (
        SELECT 1 FROM sq_thread_members m WHERE m.thread_id = ${conversation} AND m.user_id = u.id))`
  if (!rows.length) return
  const messages = conversation
    ? await db`SELECT u.name AS sender, m.body, m.effects FROM sq_private_messages m JOIN sq_users u ON u.id = m.sender_id
        WHERE m.id = ${messageId} AND m.thread_id = ${conversation} AND m.sender_id = ${senderId}`
    : await db`SELECT sender, body, effects FROM chat_messages WHERE id = ${messageId} AND sender_id = ${senderId}`
  const message = messages[0]
  if (!message) return
  const files = await db`SELECT content_type FROM sq_attachments WHERE message_id = ${messageId} AND status = 'attached'`
  await deliverPush(rows, { title: 'SQ Chat', body: messageNotification(message.sender, message.body,
    files.map(file => file.content_type), message.effects?.bubble === 'invisible'), tag: messageId,
    url: conversation ? '/?chat=' + encodeURIComponent(conversation) : '/' })
}

export async function pushSettings(actorId: string, body: string) {
  const db = await store()
  const rows = await db`SELECT p.endpoint, p.subscription FROM sq_push p
    JOIN sq_sessions s ON s.token_hash = p.session_hash JOIN sq_users u ON u.id = s.user_id
    WHERE u.id <> ${actorId} AND u.status = 'active' AND s.session_version = u.session_version
      AND s.expires_at > NOW() AND s.last_seen > NOW() - INTERVAL '365 days'`
  await deliverPush(rows, { title: 'SQ Chat', body, tag: 'sq-settings', url: '/' })
}

async function deliverPush(rows: Record<string, any>[], notification: { title: string; body: string; tag: string; url: string }) {
  if (!rows.length) return
  const db = await store()
  const keys = await pushKeys()
  const payload = JSON.stringify(notification)
  await Promise.all(rows.map(async row => {
    if (!validSubscription(row.subscription)) return
    try {
      await webpush.sendNotification(row.subscription, payload, {
        vapidDetails: { subject: 'https://sqchat.vercel.app', ...keys }, TTL: 3600, urgency: 'high', timeout: 5000
      })
      return { status: 'accepted' as const }
    } catch (error: any) {
      if (error.statusCode === 404 || error.statusCode === 410) await db`DELETE FROM sq_push WHERE endpoint = ${row.endpoint}`
      return { status: 'failed' as const, code: Number(error.statusCode) || 0 }
    }
  }))
}

export async function sendTestPush(sessionHash: string) {
  const db = await store()
  const rows = await db`SELECT p.endpoint, p.subscription FROM sq_push p
    JOIN sq_sessions s ON s.token_hash = p.session_hash JOIN sq_users u ON u.id = s.user_id
    WHERE p.session_hash = ${sessionHash} AND u.status = 'active' AND s.session_version = u.session_version
      AND s.expires_at > NOW() AND s.last_seen > NOW() - INTERVAL '365 days' LIMIT 1`
  const row = rows[0]
  if (!row || !validSubscription(row.subscription)) {
    return { sent: false, message: 'No active device subscription was found. Turn notifications off, then enable them again.' }
  }
  const keys = await pushKeys()
  try {
    const result = await webpush.sendNotification(row.subscription, JSON.stringify({
      title: 'SQ Chat', body: 'This device can receive SQ Chat notifications.', tag: 'sq-push-test', url: '/'
    }), { vapidDetails: { subject: 'https://sqchat.vercel.app', ...keys }, TTL: 60, urgency: 'high', timeout: 10000 })
    return { sent: true, statusCode: result.statusCode }
  } catch (error: any) {
    if (error.statusCode === 404 || error.statusCode === 410) await db`DELETE FROM sq_push WHERE endpoint = ${row.endpoint}`
    console.warn('Push test failed', Number(error.statusCode) || 'network')
    return { sent: false, statusCode: Number(error.statusCode) || 0,
      message: error.statusCode === 404 || error.statusCode === 410
        ? 'The device push subscription expired. Turn notifications off, then enable them again.'
        : error.statusCode === 401 || error.statusCode === 403
          ? 'The push service rejected this device key. Turn notifications off, then enable them again.'
          : 'The push service could not be reached. Check the network and try again.' }
  }
}
