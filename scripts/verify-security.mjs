import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { neon } from '@neondatabase/serverless'

const base = process.argv[2] || 'http://localhost:3001'
const origin = new URL(base).origin
const sql = neon(process.env.DATABASE_URL)
assert(process.env.SQ_ADMIN_PASSWORD, 'Set SQ_ADMIN_PASSWORD without committing it.')
const run = randomBytes(4).toString('hex')
const accounts = []
const streams = []
const admin = { cookie: '', csrf: '', user: null }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let checks = 0
function check(condition, label) { assert(condition, label); checks++; console.log(`PASS ${label}`) }
async function call(client, path, method = 'GET', body, expected = 200, extra = {}) {
  const response = await fetch(new URL(path, base), { method, headers: {
    Origin: origin, 'Content-Type': 'application/json', 'X-Requested-With': 'SQChat',
    ...(client?.cookie ? { Cookie: client.cookie, 'X-SQ-CSRF': client.csrf } : {}), ...extra
  }, ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) })
  const data = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: expected ${expected}, received ${response.status} (${data.statusMessage || 'unexpected response'})`)
  return { data, response }
}
async function login(client, name, password) {
  const { data, response } = await call(null, '/api/auth/login', 'POST', { name, password })
  client.cookie = response.headers.get('set-cookie').split(';')[0]
  client.csrf = data.csrf; client.user = data.user
  check(/HttpOnly/i.test(response.headers.get('set-cookie')) && /SameSite=Strict/i.test(response.headers.get('set-cookie')), 'session cookie is HttpOnly and SameSite Strict')
  if (base.startsWith('https:')) check(/Secure/i.test(response.headers.get('set-cookie')) && client.cookie.startsWith('__Host-'), 'production session uses Secure and __Host cookie')
}
async function waitFor(predicate, label) {
  const until = Date.now() + 20000
  while (!predicate()) { if (Date.now() > until) throw new Error(`Timed out: ${label}`); await pause(50) }
}
async function subscribe(client) {
  const controller = new AbortController()
  const response = await fetch(new URL('/api/events', base), { headers: { Cookie: client.cookie, Accept: 'text/event-stream' }, signal: controller.signal })
  assert.equal(response.status, 200)
  const state = { ready: false, changes: 0, expired: false, close: () => controller.abort() }
  streams.push(state)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  state.task = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n')
        let end
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const event = buffer.slice(0, end); buffer = buffer.slice(end + 2)
          if (event.includes('event: ready')) state.ready = true
          if (event.includes('event: change')) state.changes++
          if (event.includes('event: expired')) state.expired = true
          assert(!event.includes('body') && !event.includes('password'), 'SSE must contain no message or credential payload')
        }
      }
    } catch (error) { if (error.name !== 'AbortError') throw error }
  })()
  await waitFor(() => state.ready, 'authenticated stream ready')
  return state
}
try {
  await call(null, '/api/state', 'GET', undefined, 401)
  await call(null, '/api/events', 'GET', undefined, 401)
  await call(null, '/api/admin/accounts', 'GET', undefined, 401)
  await call(null, '/api/settings', 'PUT', {}, 401)
  check(true, 'anonymous requests cannot read chats, subscribe, or manage settings')
  await call(null, '/api/auth/login', 'POST', {}, 403, { Origin: 'https://untrusted.example' })
  check(true, 'cross-origin sign-in blocked')
  await login(admin, 'Andrew', process.env.SQ_ADMIN_PASSWORD)
  const before = (await call(admin, '/api/state')).data
  check(!JSON.stringify(before).includes('password_hash') && !JSON.stringify(admin.user).includes('password_hash'), 'chat and account payloads omit password hashes')
  for (const suffix of ['A', 'B', 'C']) {
    const account = { name: `Verify ${run} ${suffix}`, password: randomBytes(18).toString('base64url'), cookie: '', csrf: '' }
    accounts.push(account)
    await call(null, '/api/auth/request', 'POST', { name: account.name })
    const list = (await call(admin, '/api/admin/accounts')).data
    account.id = list.find(item => item.name === account.name)?.id
    assert(account.id, 'fixture account created')
    if (suffix === 'A') {
      await call(null, '/api/auth/login', 'POST', { name: account.name, password: account.password }, 401)
      check(true, 'pending account cannot sign in')
    }
    const approved = (await call(admin, '/api/admin/accounts', 'POST', { id: account.id, action: 'approve' })).data
    await call(null, '/api/auth/setup', 'POST', { code: approved.code, password: account.password })
    if (suffix === 'A') {
      await call(null, '/api/auth/setup', 'POST', { code: approved.code, password: account.password }, 400)
      check(true, 'setup code cannot be reused')
    }
    await login(account, account.name, account.password)
  }
  const [a, b, c] = accounts
  const oldSessionHash = createHash('sha256').update(a.cookie.slice(a.cookie.indexOf('=') + 1)).digest('hex')
  const oldSession = (await sql`SELECT * FROM sq_sessions WHERE token_hash = ${oldSessionHash}`)[0]
  await call(a, '/api/settings', 'PUT', before.settings, 403)
  await call(a, '/api/admin/accounts', 'GET', undefined, 403)
  await call(a, '/api/admin/audit', 'GET', undefined, 403)
  await call(a, '/api/admin/reset-people', 'POST', {}, 403)
  await call(a, '/api/messages', 'POST', { sender: 'Andrew', body: 'forged' }, 400)
  await call(a, '/api/messages', 'POST', { body: 'bad csrf' }, 403, { 'X-SQ-CSRF': 'invalid' })
  check(true, 'member cannot impersonate Andrew, administer accounts, edit settings, or bypass CSRF')
  const defaults = (await call(admin, '/api/admin/accounts')).data.filter(item => item.builtin)
  for (const account of defaults) await call(admin, '/api/admin/accounts', 'POST', { id: account.id, action: 'delete' }, 403)
  check(defaults.length >= 3, 'default accounts cannot be deleted')
  const direct = (await call(a, '/api/conversations', 'POST', { userIds: [b.id] })).data
  const sa = await subscribe(a), sb = await subscribe(b), sc = await subscribe(c), sad = await subscribe(admin)
  const snapshots = [sa, sb, sc, sad].map(stream => stream.changes)
  const message = (await call(a, '/api/messages', 'POST', { conversation: direct.id, body: `Private verification ${run}` })).data
  await waitFor(() => sa.changes > snapshots[0] && sb.changes > snapshots[1] && sad.changes > snapshots[3], 'private live delivery')
  await pause(400)
  check(sc.changes === snapshots[2], 'private live notifications exclude nonparticipants')
  await call(c, `/api/state?conversation=${direct.id}`, 'GET', undefined, 404)
  const outsider = (await call(c, '/api/state')).data
  check(!outsider.conversations.some(thread => thread.id === direct.id), 'private conversation hidden from nonparticipants')
  const review = (await call(admin, `/api/state?conversation=${direct.id}`)).data
  check(review.messages.some(item => item.id === message.id) && !review.canSend, 'Andrew can review others private chats without impersonating a participant')
  await call(admin, '/api/messages', 'POST', { conversation: direct.id, body: 'not a participant' }, 403)
  // Hold this fixture's already-used limit open while checking enforcement. Several
  // network round trips above can legitimately outlast the normal two-second window.
  const messageLimit = createHash('sha256').update(`message:${a.id}`).digest('hex')
  await sql`INSERT INTO sq_limits (key, hits, expires_at) VALUES (${messageLimit}, 1, NOW() + INTERVAL '1 minute')
    ON CONFLICT (key) DO UPDATE SET hits = 1, expires_at = EXCLUDED.expires_at`
  await call(a, '/api/messages', 'POST', { conversation: direct.id, body: 'rate test' }, 429)
  await sql`DELETE FROM sq_limits WHERE key = ${messageLimit}`
  check(true, 'messages are rate limited and review-only access cannot send')
  await call(c, `/api/conversations/${direct.id}/members`, 'POST', { userIds: [admin.user.id] }, 404)
  const cCount = sc.changes
  await call(a, `/api/conversations/${direct.id}/members`, 'POST', { userIds: [c.id] })
  await waitFor(() => sc.changes > cCount, 'new participant live update')
  const joined = (await call(c, `/api/state?conversation=${direct.id}`)).data
  check(joined.canSend && joined.messages.some(item => item.id === message.id) && joined.conversations.find(thread => thread.id === direct.id).members.length === 3, 'third person joins immediately with history and no acceptance step')
  await call(c, '/api/messages', 'POST', { conversation: direct.id, body: `Joined verification ${run}` })
  const group = (await call(b, '/api/conversations', 'POST', { userIds: [a.id, c.id], title: 'Verification group' })).data
  const groupState = (await call(a, `/api/state?conversation=${group.id}`)).data
  check(groupState.conversations.find(thread => thread.id === group.id).members.length === 3, 'new private group supports three people')
  await call(a, `/api/messages/${message.id}`, 'DELETE', {}, 403)
  await call(admin, `/api/messages/${message.id}`, 'PATCH', { body: `Edited verification ${run}` })
  check((await call(b, `/api/state?conversation=${direct.id}`)).data.messages.some(item => item.body === `Edited verification ${run}`), 'Andrew can moderate private messages')
  const allCounts = [sa, sb, sc].map(stream => stream.changes)
  await call(admin, '/api/settings', 'PUT', before.settings)
  await waitFor(() => [sa, sb, sc].every((stream, i) => stream.changes > allCounts[i]), 'settings live sync')
  check(true, 'saved appearance settings broadcast to all members')
  const nextPassword = randomBytes(20).toString('base64url')
  await call(a, '/api/auth/password', 'POST', { currentPassword: a.password, password: nextPassword }, 403)
  await call(admin, '/api/admin/accounts', 'POST', { id: a.id, action: 'allow-password' })
  await call(a, '/api/auth/password', 'POST', { currentPassword: a.password, password: nextPassword })
  await call(a, '/api/state', 'GET', undefined, 401)
  await waitFor(() => sa.expired, 'changed-password session revocation')
  // Simulate a sign-in that raced with the password change using the prior session version.
  await sql`INSERT INTO sq_sessions (token_hash, user_id, csrf, expires_at, session_version)
    VALUES (${oldSessionHash}, ${a.id}, ${oldSession.csrf}, NOW() + INTERVAL '1 hour', ${oldSession.session_version})`
  await call(a, '/api/state', 'GET', undefined, 401)
  check(true, 'stale session created during a password-change race remains invalid')
  await call(null, '/api/auth/login', 'POST', { name: a.name, password: a.password }, 401)
  await login(a, a.name, nextPassword)
  await call(a, '/api/auth/password', 'POST', { currentPassword: nextPassword, password: a.password }, 403)
  check(true, 'password change requires one-use Andrew approval and revokes sessions immediately')
  const reset = (await call(admin, '/api/admin/accounts', 'POST', { id: b.id, action: 'reset' })).data
  await call(b, '/api/state', 'GET', undefined, 401)
  await call(null, '/api/auth/login', 'POST', { name: b.name, password: b.password }, 401)
  await call(null, '/api/auth/setup', 'POST', { code: reset.code, password: randomBytes(20).toString('base64url') })
  check(true, 'Andrew reset cancels old password and sessions; member chooses replacement')
  await call(admin, '/api/admin/accounts', 'POST', { id: c.id, action: 'delete' })
  await call(c, '/api/state', 'GET', undefined, 401)
  check((await call(a, `/api/state?conversation=${direct.id}`)).data.messages.some(item => item.body === `Joined verification ${run}`), 'removing an additional user revokes access and preserves messages')
  const htmlResponse = await fetch(new URL('/login', base))
  const html = await htmlResponse.text()
  const csp = htmlResponse.headers.get('content-security-policy') || ''
  check(csp.includes("frame-ancestors 'none'") && /nonce="/.test(html), 'rendered sign-in page has nonce CSP and frame protection')
  check(htmlResponse.headers.get('cache-control')?.includes('no-store'), 'authenticated app responses are not cached')
  check(html.includes('Welcome back') && html.includes('Set password'), 'sign-in UI renders on the server')
  for (const [path, marker] of [['/', 'New conversation'], ['/manage', 'Security activity'], ['/account', 'Your sessions']]) {
    const rendered = await fetch(new URL(path, base), { headers: { Cookie: admin.cookie } })
    const body = await rendered.text()
    check(rendered.status === 200 && body.includes(marker), `authenticated ${path} page renders successfully`)
    check((body.match(/<script\b/g) || []).length === (body.match(/<script nonce=/g) || []).length, `all scripts on ${path} receive CSP nonces`)
  }
  const anonymousPage = await fetch(new URL('/', base), { redirect: 'manual' })
  check(anonymousPage.status >= 300 && anonymousPage.status < 400 && anonymousPage.headers.get('location')?.includes('/login'), 'anonymous chat page redirects to sign-in')
  const memberPage = await fetch(new URL('/manage', base), { headers: { Cookie: a.cookie }, redirect: 'manual' })
  check(memberPage.status >= 300 && memberPage.status < 400, 'members are redirected away from the settings page')
  console.log(`Security and live chat verification complete: ${checks} checks.`)
} finally {
  for (const stream of streams) stream.close()
  await Promise.allSettled(streams.map(stream => stream.task))
  // Delete only this run's uniquely named fixtures. Never reset live users or conversations.
  const rows = await sql`SELECT id FROM sq_users WHERE name = ANY(${accounts.map(item => item.name)}::text[]) AND NOT builtin`
  const ids = rows.map(row => row.id)
  if (ids.length) {
    const threads = await sql`SELECT id FROM sq_threads WHERE created_by = ANY(${ids}::text[])`
    const threadIds = threads.map(row => row.id)
    await sql.transaction([
      sql`DELETE FROM sq_attachments WHERE owner_id = ANY(${ids}::text[]) OR thread_id = ANY(${threadIds}::text[])`,
      sql`DELETE FROM sq_private_messages WHERE thread_id = ANY(${threadIds}::text[])`,
      sql`DELETE FROM sq_thread_members WHERE thread_id = ANY(${threadIds}::text[])`,
      sql`DELETE FROM sq_threads WHERE id = ANY(${threadIds}::text[])`,
      sql`DELETE FROM sq_sessions WHERE user_id = ANY(${ids}::text[])`,
      sql`DELETE FROM sq_streams WHERE user_id = ANY(${ids}::text[])`,
      sql`DELETE FROM sq_invites WHERE user_id = ANY(${ids}::text[])`,
      sql`DELETE FROM sq_audit WHERE actor_id = ANY(${ids}::text[]) OR target = ANY(${[...ids, ...threadIds]}::text[])`,
      sql`DELETE FROM sq_users WHERE id = ANY(${ids}::text[]) AND NOT builtin`
    ])
  }
  if (admin.cookie) {
    const raw = admin.cookie.slice(admin.cookie.indexOf('=') + 1)
    await sql`DELETE FROM sq_sessions WHERE token_hash = ${createHash('sha256').update(raw).digest('hex')}`
  }
  await sql`SELECT pg_notify('sqchat_changes', 'change')`
  console.log('Temporary accounts, conversations, and test sessions cleaned up.')
}
