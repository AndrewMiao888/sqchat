import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
async function moduleAt(path) {
  const output = ts.transpileModule(await readFile(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'))
}
const { messageLinks } = await moduleAt('shared/utils/links.ts')
assert.equal(messageLinks('Visit https://example.com/page.')[0].url, 'https://example.com/page')
assert.equal(messageLinks('www.example.com')[0].url, 'https://www.example.com/')
assert.equal(messageLinks('Watch youtube.com/watch?v=123 now')[0].url, 'https://youtube.com/watch?v=123')
assert.equal(messageLinks('github.com is useful')[0].url, 'https://github.com/')
assert.equal(messageLinks('Email me@example.com').length, 0)
assert.equal(messageLinks('(https://example.com/a_(b))')[0].url, 'https://example.com/a_(b)')
assert.equal(messageLinks('javascript:alert(1) https://user:pass@example.com').length, 0)
assert.equal(messageLinks('https://example.com https://example.com').length, 1)
const { publicAddress, previewUrl, previewMetadata, fetchPreview } = await moduleAt('server/utils/linkPreview.ts')
for (const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1']) assert.equal(publicAddress(ip), false, ip)
for (const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111']) assert.equal(publicAddress(ip), true, ip)
for (const url of ['file:///etc/passwd','https://example.com:444','https://me:secret@example.com']) assert.throws(() => previewUrl(url))
assert.deepEqual(previewMetadata('<title>Fallback</title><meta content="A &amp; B" property="og:title"><meta name="description" content="Hello &#39;world&#39;"><meta property="og:image" content="https://example.com/cover.png?x=1&amp;y=2"><meta property="og:site_name" content="Example">'), {title:'A & B',description:"Hello 'world'",image:'https://example.com/cover.png?x=1&y=2',siteName:'Example'})
await assert.rejects(fetchPreview('http://127.0.0.1/', AbortSignal.timeout(1000)), /Private destination/)
console.log('PASS: links, metadata, unsafe destinations and URL protocols')
const handlers = {}; let notification, pending, destination, focused
const origin = 'https://sqchat.vercel.app'
const appWindow = { url: origin + '/', navigate: async url => { destination = url; return {focus: async () => {focused = true}} } }
const workerContext = { addEventListener: (type, fn) => handlers[type] = fn,
  location: {origin}, registration: { showNotification: async (title, options) => notification = {title,...options} },
  skipWaiting: async () => {}, clients: { claim: async () => {}, matchAll: async () => [appWindow], openWindow: async url => {destination = url} } }
vm.runInNewContext(await readFile('public/sw.js', 'utf8'), { self: workerContext, URL })
handlers.push({data:{json:()=>({title:'Lucy',body:'Lucy said: Hello',url:'/?chat=abc'})},waitUntil:p=>pending=p})
await pending
assert.equal(notification.title,'Lucy'); assert.equal(notification.body,'Lucy said: Hello')
assert.equal(notification.silent,false); assert.equal(notification.renotify,true)
assert.equal(notification.requireInteraction,undefined)
assert.equal(notification.vibrate.join(','),'180,80,180')
handlers.notificationclick({notification:{...notification,close(){}},waitUntil:p=>pending=p})
await pending
assert.equal(destination,origin+'/?chat=abc'); assert.equal(focused,true)
workerContext.clients.matchAll=async()=>[]
destination=undefined
handlers.notificationclick({notification:{...notification,close(){}},waitUntil:p=>pending=p})
await pending
assert.equal(destination,origin+'/?chat=abc')
const { notificationWorker, NOTIFICATION_WORKER } = await moduleAt('app/utils/notificationWorker.ts')
let updated = false, options, registered
const worker = new EventTarget(); worker.state = 'installing'
const registration = { installing:worker, update:async()=>{ updated=true; setTimeout(()=>{worker.state='activated';worker.dispatchEvent(new Event('statechange'))},10) } }
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{register:async(url,opts)=>{registered=url;options=opts;return registration}}}})
assert.equal(await notificationWorker(),registration)
assert.equal(updated,true); assert.equal(worker.state,'activated'); assert.equal(registered,NOTIFICATION_WORKER); assert.equal(options.updateViaCache,'none')
console.log('PASS: alert presentation, chat links and forced worker activation before use')
