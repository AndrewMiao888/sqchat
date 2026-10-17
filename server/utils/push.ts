import webpush from 'web-push'
import { store } from './store'

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
  const keys = await pushKeys()
  const payload = JSON.stringify({ title: 'SQ Chat', body: 'You have a new message.', tag: messageId,
    url: conversation ? '/?chat=' + encodeURIComponent(conversation) : '/' })
  await Promise.allSettled(rows.map(async row => {
    if (!validSubscription(row.subscription)) return
    try {
      await webpush.sendNotification(row.subscription, payload, {
        vapidDetails: { subject: 'https://sqchat.vercel.app', ...keys }, TTL: 3600, urgency: 'high', timeout: 5000
      })
    } catch (error: any) {
      if (error.statusCode === 404 || error.statusCode === 410) await db`DELETE FROM sq_push WHERE endpoint = ${row.endpoint}`
      else console.warn('Push delivery failed', Number(error.statusCode) || 'network')
    }
  }))
}
