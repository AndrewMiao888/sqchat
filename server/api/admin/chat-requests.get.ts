import { requireAdmin } from '../../utils/auth'
import { store } from '../../utils/store'

export default defineEventHandler(async event => {
  await requireAdmin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const db = await store()
  const [requests, people] = await Promise.all([
    db`SELECT r.id, r.kind, r.thread_id, r.title, r.user_ids, r.created_at, u.name AS requester,
      t.title AS thread_title FROM sq_chat_requests r JOIN sq_users u ON u.id = r.requester_id
      LEFT JOIN sq_threads t ON t.id = r.thread_id WHERE r.status = 'pending' ORDER BY r.created_at DESC`,
    db`SELECT id, name, role, chat_auto_approve FROM sq_users WHERE status = 'active' ORDER BY name`
  ])
  const names = new Map(people.map(row => [row.id, row.name]))
  return { requests: requests.map(row => ({ id: row.id, kind: row.kind, requester: row.requester,
    threadId: row.thread_id, threadTitle: row.thread_title, title: row.title,
    people: (row.user_ids as string[]).map(id => names.get(id) || 'Inactive account'), createdAt: row.created_at })),
    people: people.filter(row => row.role === 'member').map(row => ({ id: row.id, name: row.name, autoApprove: row.chat_auto_approve })) }
})
