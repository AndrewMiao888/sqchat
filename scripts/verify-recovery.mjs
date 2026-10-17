import assert from 'node:assert/strict'
import { chromium, expect as baseExpect } from '@playwright/test'

const expect = baseExpect.configure({ timeout: 20000 })

const base = new URL(process.argv[2] || 'http://localhost:3001')
const headers = { Origin: base.origin, 'Content-Type': 'application/json', 'X-Requested-With': 'SQChat' }
const response = await fetch(new URL('/api/auth/login', base), { method: 'POST', headers, body: JSON.stringify({ name: 'Andrew', password: process.env.SQ_ADMIN_PASSWORD }) })
assert.equal(response.status, 200, 'Administrator sign-in')
const auth = await response.json(), cookie = response.headers.get('set-cookie').split(';')[0], separator = cookie.indexOf('=')
const browser = await chromium.launch({ headless: true })
let checks = 0
function check(condition, label) { assert(condition, label); checks++; console.log(`PASS ${label}`) }
async function pageFor() {
  const context = await browser.newContext()
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), domain: base.hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }])
  const page = await context.newPage(); page.setDefaultTimeout(20000)
  return page
}
async function storageEmpty(page) { return page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0) }
try {
  // Discover the deployed hashed route files instead of depending on a local build's filenames.
  const discovery = await pageFor(), sources = new Map(), reads = []
  discovery.on('response', response => { if (/\/_nuxt\/[^/]+\.js(?:\?|$)/.test(response.url())) reads.push(response.text().then(text => sources.set(response.url(), text)).catch(() => {})) })
  await discovery.goto(base.href, { waitUntil: 'domcontentloaded' })
  await expect(discovery.getByRole('textbox', { name: 'Your message' })).toBeVisible()
  await discovery.getByRole('link', { name: 'Andrew', exact: true }).click()
  await expect(discovery.getByRole('heading', { name: 'Your sessions' })).toBeVisible()
  await Promise.all(reads)
  const chatChunk = [...sources].find(([, text]) => text.includes('Group conversation'))?.[0]
  const accountChunk = [...sources].find(([, text]) => text.includes('Current password'))?.[0]
  assert(chatChunk && accountChunk, 'Route chunks discovered')
  await discovery.context().close()

  const initial = await pageFor(); let documents = 0, failures = 0
  initial.on('request', request => { if (request.resourceType() === 'document') documents++ })
  await initial.route(chatChunk, route => { if (documents === 1) { failures++; return route.abort('failed') }; return route.continue() })
  await initial.goto(base.href, { waitUntil: 'domcontentloaded' })
  await expect(initial.getByRole('textbox', { name: 'Your message' })).toBeVisible()
  await expect.poll(() => documents).toBe(2)
  await expect(initial).not.toHaveURL(/_sq_retry/)
  check(failures > 0, 'a failed initial chat module automatically recovers once')
  check(await storageEmpty(initial), 'automatic recovery writes no localStorage or sessionStorage')
  await initial.context().close()

  const navigation = await pageFor(); let navigationDocuments = 0, navigationFailures = 0
  navigation.on('request', request => { if (request.resourceType() === 'document') navigationDocuments++ })
  await navigation.route(accountChunk, route => { if (navigationDocuments === 1) { navigationFailures++; return route.abort('failed') }; return route.continue() })
  await navigation.goto(base.href, { waitUntil: 'domcontentloaded' })
  await expect(navigation.getByRole('textbox', { name: 'Your message' })).toBeVisible()
  await navigation.getByRole('link', { name: 'Andrew', exact: true }).click()
  await expect(navigation.getByRole('heading', { name: 'Your sessions' })).toBeVisible()
  check(navigationDocuments === 2 && navigationFailures > 0 && new URL(navigation.url()).pathname === '/account', 'failed navigation recovers at the intended destination')
  check(await storageEmpty(navigation), 'navigation recovery does not persist authentication or chat state')
  await navigation.context().close()

  const persistent = await pageFor(); let persistentDocuments = 0
  persistent.on('request', request => { if (request.resourceType() === 'document') persistentDocuments++ })
  await persistent.route(chatChunk, route => route.abort('failed'))
  await persistent.goto(base.href, { waitUntil: 'domcontentloaded' })
  await expect(persistent.getByRole('heading', { name: 'Let’s reconnect.' })).toBeVisible()
  await expect.poll(() => persistentDocuments).toBe(2)
  await persistent.waitForTimeout(1500)
  check(persistentDocuments === 2, 'persistent failure stops after one automatic retry and offers a recovery screen')
  await persistent.unroute(chatChunk)
  await persistent.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(persistent.getByRole('textbox', { name: 'Your message' })).toBeVisible()
  check(persistentDocuments === 3 && await storageEmpty(persistent), 'manual retry restores the chat without browser storage')
  await persistent.context().close()

  const draft = await pageFor(); let draftDocuments = 0
  draft.on('request', request => { if (request.resourceType() === 'document') draftDocuments++ })
  await draft.route(accountChunk, route => route.abort('failed'))
  await draft.goto(base.href, { waitUntil: 'domcontentloaded' })
  await draft.getByRole('textbox', { name: 'Your message' }).fill('Keep this unsent message safe.')
  draft.on('dialog', dialog => dialog.accept())
  await draft.getByRole('link', { name: 'Andrew', exact: true }).click()
  await expect(draft.getByLabel('Copy your unsent message before reloading.')).toHaveValue('Keep this unsent message safe.')
  check(draftDocuments === 1, 'an unsent draft prevents automatic reload and remains available to copy')
  check(await storageEmpty(draft), 'unsent text remains in memory only')
  console.log(`Recovery verification complete: ${checks} checks.`)
} finally {
  await browser.close()
  await fetch(new URL('/api/auth/logout', base), { method: 'POST', headers: { ...headers, Cookie: cookie, 'X-SQ-CSRF': auth.csrf }, body: '{}' })
}
