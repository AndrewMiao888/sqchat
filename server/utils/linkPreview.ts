import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { request } from 'node:https'
import { request as httpRequest } from 'node:http'

const blocked = new BlockList()
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(address, prefix)
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
blocked.addSubnet('2001::', 23, 'ipv6')
blocked.addSubnet('2001:db8::', 32, 'ipv6')
blocked.addSubnet('2002::', 16, 'ipv6')
blocked.addSubnet('3fff::', 20, 'ipv6')
export function publicAddress(address: string) {
  const family = isIP(address)
  return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6')
}
export function previewUrl(value: string) {
  const url = new URL(value)
  if (value.length > 2048 || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('Unsupported URL')
  return url
}
const decode = (value: string) => value.replace(/<[^>]*>/g, '').replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[\da-f]+|\d+);/gi, entity => {
  const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' }
  if (named[entity.toLowerCase()]) return named[entity.toLowerCase()]!
  const number = entity[2]?.toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10)
  return Number.isFinite(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ''
}).replace(/\s+/g, ' ').trim()
export function previewMetadata(html: string) {
  const meta: Record<string, string> = {}
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes: Record<string, string> = {}
    for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attributes[attr[1]!.toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? ''
    const key = attributes.property || attributes.name
    if (key && attributes.content) meta[key.toLowerCase()] = attributes.content
  }
  return {
    title: decode(meta['og:title'] || meta['twitter:title'] || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0, 180),
    description: decode(meta['og:description'] || meta.description || meta['twitter:description'] || '').slice(0, 300),
    image: decode(meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'] || ''),
    siteName: decode(meta['og:site_name'] || '').slice(0, 80)
  }
}

async function fetchPublic(value: string, signal: AbortSignal, kind: 'html' | 'image', redirects = 0): Promise<Buffer> {
  const url = previewUrl(value)
  signal.throwIfAborted()
  const addresses = await new Promise<Awaited<ReturnType<typeof lookup>>[]>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
  signal.throwIfAborted()
  if (!addresses.length || addresses.some(entry => !publicAddress(entry.address))) throw new Error('Private destination')
  const address = addresses[0]!
  // Pin the connection to the validated address; redirects get their own validation.
  const response = await new Promise<{ data?: Buffer; redirect?: string }>((resolve, reject) => {
    const req = (url.protocol === 'https:' ? request : httpRequest)(url, {
      signal, agent: false, family: address.family,
      lookup: ((_hostname: string, options: any, callback: any) => options?.all ? callback(null, [address]) : callback(null, address.address, address.family)) as any,
      headers: { 'User-Agent': 'SQChat-LinkPreview/1.0', Accept: kind === 'html' ? 'text/html' : 'image/png,image/jpeg,image/webp,image/gif', 'Accept-Encoding': 'identity' }
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) { resolve({ redirect: res.headers.location }); res.destroy(); return }
      const type = res.headers['content-type']?.split(';')[0]?.trim().toLowerCase()
      if (res.statusCode !== 200 || (kind === 'html' ? type !== 'text/html' : !['image/png','image/jpeg','image/webp','image/gif'].includes(type || ''))) { res.destroy(); reject(new Error('Unsupported preview content')); return }
      const chunks: Buffer[] = []; let size = 0
      res.on('data', (chunk: Buffer) => {
        const limit = kind === 'html' ? 512 * 1024 : 2 * 1024 * 1024
        if (size + chunk.length > limit) {
          if (kind === 'image') { res.destroy(); reject(new Error('Preview too large')); return }
          chunks.push(chunk.subarray(0, limit - size))
          resolve({ data: Buffer.concat(chunks) })
          res.destroy()
          return
        }
        size += chunk.length
        chunks.push(chunk)
        if (kind === 'html' && /<\/head\s*>/i.test(Buffer.concat(chunks).toString('utf8'))) {
          resolve({ data: Buffer.concat(chunks) })
          res.destroy()
        }
      })
      res.on('end', () => resolve({ data: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
  if (response.redirect) {
    if (redirects >= 3) throw new Error('Too many redirects')
    return fetchPublic(new URL(response.redirect, url).href, signal, kind, redirects + 1)
  }
  return response.data || Buffer.alloc(0)
}

export async function fetchPreview(value: string, signal: AbortSignal) {
  const html = await fetchPublic(value, signal, 'html')
  const metadata = previewMetadata(html.toString('utf8'))
  let image = ''
  if (metadata.image) {
    try { image = previewUrl(new URL(metadata.image, value).href).href } catch { /* Ignore invalid image URLs. */ }
  }
  return { title: metadata.title, description: metadata.description, image, siteName: metadata.siteName }
}

export async function fetchPreviewImage(value: string, signal: AbortSignal) {
  return fetchPublic(value, signal, 'image')
}
