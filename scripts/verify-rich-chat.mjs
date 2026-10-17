import assert from 'node:assert/strict'
import { randomBytes, randomUUID, scrypt, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdir } from 'node:fs/promises'
import { neon } from '@neondatabase/serverless'
import { put } from '@vercel/blob/client'
import { del } from '@vercel/blob'
import { chromium, expect } from '@playwright/test'

const base = process.argv[2] || 'http://localhost:3001', origin = new URL(base).origin
const sql = neon(process.env.DATABASE_URL), run = randomBytes(4).toString('hex')
const users = [], sessions = [], sharedMessages = [], blobPaths = [], threadIds = []
let browser, checks = 0
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
function check(condition, label) { assert(condition, label); checks++; console.log(`PASS ${label}`) }
async function call(client, path, method = 'GET', body, expected = 200) {
  const response = await fetch(new URL(path, base), { method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Requested-With': 'SQChat', ...(client ? { Cookie: client.cookie, 'X-SQ-CSRF': client.csrf } : {}) }, ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) })
  const data = await response.json()
  assert.equal(response.status, expected, `${method} ${path}: ${response.status} ${data.statusMessage || ''}`)
  return data
}
async function login(name, password) {
  const response = await fetch(new URL('/api/auth/login', base), { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Requested-With': 'SQChat' }, body: JSON.stringify({ name, password }) })
  assert.equal(response.status, 200, `Sign-in failed for ${name}`)
  const data = await response.json(), client = { ...data, cookie: response.headers.get('set-cookie').split(';')[0] }
  sessions.push(client); return client
}
async function upload(client, conversation, name, bytes) {
  const file = await call(client, '/api/attachments/prepare', 'POST', { conversation, name, size: bytes.length })
  blobPaths.push(file.pathname)
  const blob = await put(file.pathname, bytes, { token: file.token, access: 'private', contentType: file.contentType })
  await call(client, `/api/attachments/${file.id}/complete`, 'POST', {})
  return { ...file, url: blob.url, bytes }
}
async function download(client, id, status = 200, headers = {}) {
  const response = await fetch(new URL(`/api/attachments/${id}`, base), { headers: { ...(client ? { Cookie: client.cookie } : {}), ...headers } })
  assert.equal(response.status, status, `Download expected ${status}, received ${response.status}`)
  return response
}
async function pageFor(client, path = '/') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } })
  const separator = client.cookie.indexOf('=')
  await context.addCookies([{ name: client.cookie.slice(0, separator), value: client.cookie.slice(separator + 1), domain: new URL(base).hostname, path: '/', secure: true, httpOnly: true, sameSite: 'Strict' }])
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  await page.addInitScript(() => {
    window.__sqAudioStarts = 0
    const NativeAudioContext = window.AudioContext
    window.AudioContext = class extends NativeAudioContext {
      createOscillator() { const oscillator = super.createOscillator(), start = oscillator.start.bind(oscillator); oscillator.start = (...args) => { window.__sqAudioStarts++; return start(...args) }; return oscillator }
    }
  })
  await page.goto(new URL(path, base).href)
  return page
}
try {
  const admin = await login('Andrew', process.env.SQ_ADMIN_PASSWORD)
  const salt = randomBytes(16), password = randomBytes(20).toString('base64url')
  const key = await promisify(scrypt)(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 })
  const hash = `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
  for (const suffix of ['A', 'B', 'Private']) {
    const user = { id: randomUUID(), name: `Media ${run} ${suffix}` }; users.push(user)
    await sql`INSERT INTO sq_users (id,name,name_key,status,password_hash,private_only) VALUES (${user.id},${user.name},${user.name.toLowerCase()},'active',${hash},${suffix === 'Private'})`
    Object.assign(user, await login(user.name, password))
  }
  const [a,b,privateUser] = users
  const thread = await call(a, '/api/conversations', 'POST', { userIds: [b.id], title: `Media check ${run}` }); threadIds.push(thread.id)
  const privateThread = await call(privateUser, '/api/conversations', 'POST', { userIds: [b.id] }); threadIds.push(privateThread.id)
  const privateState = await call(privateUser, '/api/state')
  check(!privateState.canSend && privateState.messages.length === 0 && privateState.people.length === 0, 'private-only account cannot read the shared room')
  check((await call(privateUser, `/api/state?conversation=${privateThread.id}`)).canSend, 'private-only account can chat with an approved non-admin person')
  await call(privateUser, '/api/messages', 'POST', { body: 'blocked shared post' }, 403)
  await call(privateUser, '/api/attachments/prepare', 'POST', { name: 'blocked.txt', size: 3 }, 403)
  await call(a, `/api/conversations/${thread.id}`, 'DELETE', {}, 403)
  await call(a, '/api/conversations/shared', 'DELETE', {}, 403)
  check(true, 'only Andrew can delete chats or clear the shared room')
  await call(a, '/api/attachments/prepare', 'POST', { name: 'blocked.html', size: 10 }, 400)
  await call(a, '/api/attachments/prepare', 'POST', { name: 'blocked.svg', size: 10 }, 400)
  await call(a, '/api/attachments/prepare', 'POST', { name: 'big.zip', size: 20971521 }, 400)
  await call(privateUser, '/api/attachments/prepare', 'POST', { name: 'blocked.txt', size: 3, conversation: thread.id }, 404)
  check(true, 'upload allowlist, file size, and conversation authorization enforced')
  browser = await chromium.launch({ headless: true })
  const page = await pageFor(a, `/?chat=${thread.id}`), recipient = await pageFor(b, `/?chat=${thread.id}`)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  recipient.on('pageerror', error => errors.push(error.message))
  for(const current of [page,recipient]) current.on('console',entry=>{if(/violat.*content security policy|content security policy.*violat/i.test(entry.text())) errors.push('CSP violation')})
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jc1kAAAAASUVORK5CYII=', 'base64')
  const video = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 80
    const context = canvas.getContext('2d'), stream = canvas.captureStream(10), chunks = []
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    recorder.ondataavailable = event => chunks.push(event.data)
    const done = new Promise(resolve => { recorder.onstop = resolve })
    recorder.start(); context.fillStyle = '#63835b'; context.fillRect(0, 0, 80, 80)
    await new Promise(resolve => setTimeout(resolve, 300)); recorder.stop(); await done; stream.getTracks().forEach(track => track.stop())
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))
  }))
  const wav = Buffer.alloc(44 + 1600); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(1600,40)
  const files = []
  for (const [name, bytes] of [['photo.png',png],['notes.txt',Buffer.from('Private attachment verification')],['sound.wav',wav],['clip.webm',video]]) files.push(await upload(a, thread.id, name, bytes))
  for (const file of files) {
    await download(b,file.id,404)
    const raw = await fetch(file.url); check(raw.status === 403 || raw.status === 401 || raw.status === 404, `${file.name} has no public storage access`)
  }
  const message = await call(a,'/api/messages','POST',{conversation:thread.id,body:'Photo, file, audio and video',attachments:files.map(file=>file.id)})
  await expect(recipient.locator('.attachment-card')).toHaveCount(4)
  check(true,'all four attachment types arrive in a second browser without refreshing')
  await expect(recipient.locator('.attachment-image img')).toHaveJSProperty('naturalWidth',1)
  await expect.poll(()=>recipient.locator('video').evaluate(element=>element.readyState)).toBeGreaterThan(0)
  await expect.poll(()=>recipient.locator('audio').evaluate(element=>element.readyState)).toBeGreaterThan(0)
  check(true,'image, audio and video previews load successfully')
  for (const file of files) {
    const response = await download(b,file.id)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), file.bytes)
    await download(privateUser,file.id,404); await download(null,file.id,401)
  }
  check(true,'downloads preserve exact bytes and block outsiders and anonymous visitors')
  const range = await download(b,files[3].id,206,{Range:'bytes=0-15'})
  assert.deepEqual(Buffer.from(await range.arrayBuffer()),video.subarray(0,16))
  await download(b,files[3].id,416,{Range:'bytes=-'})
  check(true,'media byte ranges support seeking and reject malformed ranges')
  await call(a,`/api/attachments/${files[0].id}`,'DELETE',{},403)
  await pause(2100)
  await call(a,'/api/messages','POST',{conversation:thread.id,body:'duplicate file',attachments:[files[0].id]},409)
  check(true,'attached files cannot be deleted by members or reused in another message')
  const bad = await call(a,'/api/attachments/prepare','POST',{conversation:thread.id,name:'fake.png',size:20}); blobPaths.push(bad.pathname)
  await put(bad.pathname,Buffer.alloc(20),{token:bad.token,access:'private',contentType:bad.contentType})
  await call(a,`/api/attachments/${bad.id}/complete`,'POST',{},400)
  check(true,'invalid image contents are rejected')
  await recipient.getByRole('button',{name:'View photo.png',exact:true}).click()
  await expect(recipient.getByRole('dialog')).toBeVisible()
  await recipient.keyboard.press('Escape')
  await expect(recipient.getByRole('dialog')).toHaveCount(0)
  const downloadEvent = recipient.waitForEvent('download')
  await recipient.getByRole('link',{name:'Download',exact:true}).first().click()
  check((await downloadEvent).suggestedFilename() === 'photo.png','photo viewer closes with Escape and download keeps its filename')
  const fallbackDownload = recipient.waitForEvent('download')
  await recipient.getByRole('button',{name:'Save / share photo',exact:true}).click()
  check((await fallbackDownload).suggestedFilename() === 'photo.png','save/share falls back to downloading on desktop')
  const composer = page.locator('.rich-composer'), draft = page.getByRole('textbox',{name:'Your message'})
  await draft.fill('Every word can move')
  await composer.getByRole('button',{name:'Effects',exact:true}).click()
  for (const effect of ['big','small','shake','nod','explode','ripple','bloom','jitter']) {
    await composer.getByRole('button',{name:effect,exact:true}).click()
    check(await composer.locator(`.text-effect-${effect}`).first().evaluate(element=>getComputedStyle(element).animationName) === `sq-${effect}`, `${effect} text preview animates`)
  }
  await composer.getByRole('button',{name:'Clear effects',exact:true}).click()
  await draft.evaluate(element=>{element.focus();element.setSelectionRange(0,5);element.dispatchEvent(new Event('select'))})
  await composer.getByRole('button',{name:'big',exact:true}).click()
  check(await composer.locator('.text-effect-big').count()===5,'text effects apply to selected words')
  await composer.getByRole('button',{name:'bubble',exact:true}).click()
  for (const effect of ['slam','loud','gentle']) {
    await composer.getByRole('button',{name:effect,exact:true}).click()
    check(await composer.locator(`.bubble-effect-${effect}`).evaluate(element=>getComputedStyle(element).animationName) === `sq-${effect}`,`${effect} bubble preview animates`)
  }
  await composer.getByRole('button',{name:'Invisible ink',exact:true}).click()
  await expect(composer.locator('.ink-content')).toHaveAttribute('inert','')
  await composer.getByRole('button',{name:'Reveal invisible ink message'}).click()
  await expect(composer.locator('.ink-message')).toHaveClass(/ink-revealed/)
  await composer.getByRole('button',{name:'Hide again'}).click()
  await expect(composer.locator('.ink-message')).not.toHaveClass(/ink-revealed/)
  check(true,'invisible ink conceals, reveals and hides content again')
  await composer.getByRole('button',{name:'screen',exact:true}).click()
  for (const effect of ['echo','spotlight','balloons','confetti','love','lasers','fireworks','celebration']) {
    await composer.getByRole('button',{name:effect,exact:true}).click()
    await expect(page.locator(`.screen-${effect}`)).toBeVisible()
    await page.getByRole('button',{name:'Dismiss effect'}).click()
    check(true,`${effect} full-screen preview displays and dismisses`)
  }
  await page.getByRole('button',{name:'Sound off',exact:true}).click()
  await composer.getByRole('button',{name:'fireworks',exact:true}).click()
  await expect(page.getByRole('button',{name:'Sound on',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect.poll(()=>page.evaluate(()=>window.__sqAudioStarts)).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await page.emulateMedia({reducedMotion:'reduce'})
  await composer.getByRole('button',{name:'confetti',exact:true}).click()
  await expect(page.locator('.screen-effect')).toHaveCount(0)
  check(true,'sound is opt-in and reduced-motion prevents full-screen playback')
  await page.emulateMedia({reducedMotion:'no-preference'})
  await composer.getByRole('button',{name:'Clear effects',exact:true}).click()
  await composer.getByRole('button',{name:'Close effects'}).click()
  const send = composer.getByRole('button',{name:'Send message. Hold for effects.',exact:true})
  const box = await send.boundingBox(); await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await pause(600); await page.mouse.up()
  await expect(composer.getByRole('button',{name:'bubble',exact:true})).toHaveAttribute('aria-pressed','true')
  check(await draft.inputValue()==='Every word can move','holding Send opens bubble effects without sending')
  await composer.getByRole('button',{name:'Close effects'}).click(); await draft.fill('Browser upload and live delivery')
  await composer.locator('input[type=file]').setInputFiles({name:'browser-photo.png',mimeType:'image/png',buffer:png})
  await expect(composer.locator('.upload-item small')).toContainText('Ready',{timeout:60000})
  await send.click()
  await expect(recipient.locator('.message-row').filter({hasText:'Browser upload and live delivery'})).toContainText('browser-photo.png')
  check(true,'browser uploads with a scoped token and sends an attachment live')
  await composer.getByRole('button',{name:'Effects',exact:true}).click()
  await composer.getByRole('button',{name:'screen',exact:true}).click()
  await composer.getByRole('checkbox').check()
  await composer.getByRole('button',{name:'Close effects'}).click()
  await draft.fill('Happy Birthday')
  await pause(2200); await send.click()
  await expect(recipient.locator('.message-row').filter({hasText:'Happy Birthday'})).toBeVisible()
  await expect(recipient.locator('.screen-balloons')).toBeVisible()
  check(true,'birthday greeting automatically plays balloons in the recipient browser')
  const text = 'Big Small Shake Nod Explode Ripple Bloom Jitter', names = ['big','small','shake','nod','explode','ripple','bloom','jitter']; let offset=0
  const spans=text.split(' ').map((word,index)=>{const span={start:offset,end:offset+word.length,effect:names[index]};offset+=word.length+1;return span})
  await pause(2200)
  const styled = await call(a,'/api/messages','POST',{conversation:thread.id,body:text,effects:{text:spans,bubble:'loud',screen:'celebration'}})
  const persisted=(await call(b,`/api/state?conversation=${thread.id}`)).messages.find(item=>item.id===styled.id)
  check(persisted.effects.text.length===8&&persisted.effects.screen==='celebration'&&persisted.effects.bubble==='loud','all text effects and bubble/screen choices persist on the server')
  await call(a,'/api/messages','POST',{conversation:thread.id,body:'bad',effects:{text:[null]}},400)
  await call(a,'/api/messages','POST',{conversation:thread.id,body:'bad',effects:{screen:'invalid'}},400)
  check(true,'invalid animation payloads fail validation')
  for(const [greeting,effect] of [['Congratulations','confetti'],['Happy New Year','fireworks'],['Happy Anniversary','celebration']]) {
    await pause(2200)
    const sent=await call(a,'/api/messages','POST',{conversation:thread.id,body:greeting})
    const state=await call(b,`/api/state?conversation=${thread.id}`)
    check(state.messages.find(item=>item.id===sent.id).effects.screen===effect,`${greeting} triggers ${effect}`)
  }
  const shared = await upload(a,'','shared-check.txt',Buffer.from('shared fixture'))
  await pause(2200)
  const sharedMessage=await call(a,'/api/messages','POST',{body:'',attachments:[shared.id]});sharedMessages.push(sharedMessage.id)
  await download(privateUser,shared.id,404)
  check((await call(b,'/api/state')).messages.some(item=>item.id===sharedMessage.id&&item.body===''),'file-only messages work while private-only accounts cannot download shared files')
  const privatePage=await pageFor(privateUser)
  await expect(privatePage.getByRole('link',{name:/Everyone/})).toHaveCount(0)
  await expect(privatePage.getByRole('heading',{name:'Your private chats'})).toBeVisible()
  check(true,'private-only UI has no shared-room entry')
  await mkdir('test-results',{recursive:true})
  await page.getByRole('link',{name:'SQ Chat home'}).hover()
  check(await page.locator('.brand-letter-s').evaluate(element=>getComputedStyle(element).animationName)==='logo-s','logo letters animate on hover')
  await page.screenshot({path:'test-results/chat-desktop.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  await page.screenshot({path:'test-results/chat-mobile.png',fullPage:true})
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile layout has no horizontal overflow')
  check(await page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0),'chat does not use browser storage')
  check(errors.length===0,`browser has no uncaught application errors (${errors.length})`)
  await call(admin,`/api/messages/${message.id}`,'DELETE',{})
  for(const file of files) await download(b,file.id,404)
  check(true,'Andrew deleting a message revokes every attachment download')
  await expect(page.getByRole('button',{name:'Delete chat',exact:true})).toHaveCount(0)
  const adminPage = await pageFor(admin,`/?chat=${thread.id}`)
  adminPage.on('dialog',dialog=>dialog.accept())
  const deleted = adminPage.waitForResponse(response=>response.url().includes('/api/conversations/'+thread.id)&&response.request().method()==='DELETE')
  await adminPage.getByRole('button',{name:'Delete chat',exact:true}).click()
  assert.equal((await deleted).status(),200,'Andrew delete-chat request succeeds')
  await call(a,`/api/state?conversation=${thread.id}`,'GET',undefined,404)
  await expect(recipient.getByText('Conversation not found.',{exact:true})).toBeVisible()
  check(true,'Andrew deletes a conversation and participants see the removal live')
  if(process.env.SQ_LUCY_PASSWORD){
    const lucy=await login('Lucy',process.env.SQ_LUCY_PASSWORD)
    check(lucy.user.privateOnly&&!!lucy.user.homeConversation,'Lucy signs in directly with a default private conversation')
    const home=await call(lucy,`/api/state?conversation=${lucy.user.homeConversation}`)
    check(home.canSend&&home.conversations.find(item=>item.id===lucy.user.homeConversation).members.some(item=>item.name==='Andrew'),'Lucy default conversation includes Andrew')
    check(!(await call(lucy,'/api/state')).canSend,'Lucy has no shared-room access')
  }
  console.log(`Rich chat verification complete: ${checks} checks.`)
} finally {
  await browser?.close()
  const ids=users.map(user=>user.id)
  const files=ids.length?await sql`SELECT blob_path FROM sq_attachments WHERE owner_id=ANY(${ids}::text[])`:[]
  await Promise.allSettled([...new Set([...blobPaths,...files.map(file=>file.blob_path)])].map(path=>del(path)))
  if(ids.length) await sql.transaction([
    sql`DELETE FROM sq_attachments WHERE owner_id=ANY(${ids}::text[])`,
    sql`DELETE FROM chat_messages WHERE id=ANY(${sharedMessages}::text[])`,
    sql`DELETE FROM sq_private_messages WHERE thread_id=ANY(${threadIds}::text[])`,
    sql`DELETE FROM sq_thread_members WHERE thread_id=ANY(${threadIds}::text[])`,
    sql`DELETE FROM sq_threads WHERE id=ANY(${threadIds}::text[])`,
    sql`DELETE FROM sq_sessions WHERE user_id=ANY(${ids}::text[])`,
    sql`DELETE FROM sq_streams WHERE user_id=ANY(${ids}::text[])`,
    sql`DELETE FROM sq_audit WHERE actor_id=ANY(${ids}::text[]) OR target=ANY(${[...ids,...threadIds]}::text[])`,
    sql`DELETE FROM sq_users WHERE id=ANY(${ids}::text[]) AND NOT builtin`
  ])
  for(const client of sessions){const raw=client.cookie.slice(client.cookie.indexOf('=')+1);await sql`DELETE FROM sq_sessions WHERE token_hash=${createHash('sha256').update(raw).digest('hex')}`}
  await sql`SELECT pg_notify('sqchat_changes','change')`
  console.log('Test accounts, chats, files and sessions cleaned up.')
}
