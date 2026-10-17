import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { neon } from '@neondatabase/serverless'
import { chromium } from '@playwright/test'

const base = process.argv[2] || 'http://localhost:3001'
const db = neon(process.env.DATABASE_URL)
const prefix = 'push-test-' + randomBytes(5).toString('hex')
const ids = ['sender', 'shared', 'private', 'excluded'].map(s => prefix + s)
const raw = randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(raw).digest('hex')
const csrf = randomBytes(32).toString('base64url')
const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/' + prefix, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } }
const cookie = '__Host-sq_session=' + raw
let count = 0
function check(value, label) { assert(value, label); console.log('PASS ' + label); count++ }
async function call(method, body, authenticated = true) {
  return fetch(base + '/api/push', { method, headers: { Origin: base, 'Content-Type': 'application/json', 'X-Requested-With': 'SQChat', ...(authenticated ? { Cookie: cookie, 'X-SQ-CSRF': csrf } : {}) }, ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) })
}
try {
  check((await call('GET', null, false)).status === 401, 'anonymous subscriptions blocked')
  for (let i = 0; i < ids.length; i++) {
    await db`INSERT INTO sq_users (id,name,name_key,status,private_only) VALUES (${ids[i]},${ids[i]},${ids[i]},'active',${i >= 2})`
    await db`INSERT INTO sq_sessions (token_hash,user_id,csrf,expires_at) VALUES (${i === 0 ? hash : ids[i]},${ids[i]},${csrf},NOW()+INTERVAL '1 day')`
  }
  const keys = await (await call('GET')).json()
  check(typeof keys.publicKey === 'string' && !keys.privateKey, 'only public VAPID key returned')
  for (const endpoint of ['http://fcm.googleapis.com/test', 'https://127.0.0.1/test', 'https://fcm.googleapis.com.evil.example/test', 'https://fcm.googleapis.com:444/test']) {
    check((await call('POST', { ...sub, endpoint })).status === 400, 'unsafe push endpoint rejected')
  }
  check((await call('POST', sub)).status === 200, 'subscription saved')
  check((await db`SELECT endpoint FROM sq_push WHERE session_hash=${hash}`).length === 1, 'subscription tied to current session')
  check((await call('DELETE')).status === 200 && !(await db`SELECT endpoint FROM sq_push WHERE session_hash=${hash}`).length, 'disable removes subscription')
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ permissions: ['notifications'] })
    await context.addCookies([{ name: '__Host-sq_session', value: raw, domain: new URL(base).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }])
    const page = await context.newPage()
    await page.goto(base + '/account', { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: 'Device notifications' }).waitFor()
    await page.getByRole('button', { name: 'Enable notifications', exact: true }).waitFor()
    check(await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active), 'browser registers active background worker')
    console.log('Notification permission in test browser:', await page.evaluate(() => Notification.permission))
    check(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0), 'notifications require no browser storage')
    await context.close()
  } finally { await browser.close() }
  await call('POST', sub)
  await db`INSERT INTO sq_threads (id,created_by) VALUES (${prefix},${ids[0]})`
  for (const id of [ids[0], ids[2]]) await db`INSERT INTO sq_thread_members(thread_id,user_id) VALUES (${prefix},${id})`
  for (let i = 1; i < ids.length; i++) {
    const fixture = { ...sub, endpoint: sub.endpoint + i }
    await db`INSERT INTO sq_push(endpoint,session_hash,subscription) VALUES (${fixture.endpoint},${ids[i]},${JSON.stringify(fixture)}::jsonb)`
  }
  // Run the actual dispatch function against fixture database rows, replacing only network transport.
  let source = await readFile('server/utils/push.ts', 'utf8')
  source = source.replace("import webpush from 'web-push'", 'const webpush = globalThis.__pushTransport').replace("import { store } from './store'", 'const store = async () => globalThis.__pushDb')
  const sent = []
  globalThis.__pushDb = db
  globalThis.__pushTransport = { sendNotification: async (subscription, payload) => { sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) }) } }
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const { pushMessage } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
  // Other real subscriptions may exist; assertions only inspect these unique fixtures.
  await pushMessage(ids[0], null, prefix)
  check(sent.filter(x => x.endpoint.includes(prefix)).map(x => x.endpoint).join() === sub.endpoint + '1', 'shared push excludes sender and restricted users')
  sent.length = 0
  await pushMessage(ids[0], prefix, prefix)
  check(sent.filter(x => x.endpoint.includes(prefix)).map(x => x.endpoint).join() === sub.endpoint + '2', 'private push reaches participants only')
  check(sent.every(x => x.payload.body === 'You have a new message.'), 'lock-screen payload hides message content')
  await db`UPDATE sq_users SET session_version=1 WHERE id=${ids[2]}`
  sent.length = 0; await pushMessage(ids[0], prefix, prefix)
  check(!sent.some(x => x.endpoint.includes(prefix)), 'revoked session cannot receive push')
  await db`DELETE FROM sq_sessions WHERE token_hash=${hash}`
  check(!(await db`SELECT endpoint FROM sq_push WHERE endpoint=${sub.endpoint}`).length, 'sign-out cascades subscription removal')
  const favicon = await fetch(base + '/favicon.svg?accent=%23123456')
  check(favicon.status === 200 && (await favicon.text()).includes('fill="#123456"'), 'favicon uses selected accent')
  for (const path of ['/sw.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']) check((await fetch(base + path)).status === 200, path + ' available')
  const handlers = {}; let notification; let pending; let focused = false; let posted
  const worker = { addEventListener: (name, fn) => { handlers[name] = fn }, location: { origin: base }, registration: { showNotification: async (title, options) => { notification = { title, ...options } } }, clients: { matchAll: async () => [{ postMessage: data => { posted = data }, focus: async () => { focused = true } }] } }
  vm.runInNewContext(await readFile('public/sw.js', 'utf8'), { self: worker, URL })
  handlers.push({ data: { json: () => ({ tag: prefix, url: '/?chat=' + prefix }) }, waitUntil: p => { pending = p } }); await pending
  check(notification.tag === prefix && notification.title === 'SQ Chat', 'worker presents persistent system notification')
  handlers.notificationclick({ notification: { ...notification, close() {} }, waitUntil: p => { pending = p } }); await pending
  check(focused && posted.url === '/?chat=' + prefix, 'notification click focuses app and requests correct chat without forced reload')
  console.log(`${count} notification checks passed`)
} finally {
  await db`DELETE FROM sq_push WHERE endpoint LIKE ${'%' + prefix + '%'}`
  await db`DELETE FROM sq_thread_members WHERE thread_id=${prefix}`
  await db`DELETE FROM sq_threads WHERE id=${prefix}`
  await db`DELETE FROM sq_sessions WHERE user_id=ANY(${ids}::text[])`
  await db`DELETE FROM sq_users WHERE id=ANY(${ids}::text[])`
  delete globalThis.__pushDb; delete globalThis.__pushTransport
}
