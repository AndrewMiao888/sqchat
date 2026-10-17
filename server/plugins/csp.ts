import { randomBytes } from 'node:crypto'

export default defineNitroPlugin(nitro => {
  nitro.hooks.hook('render:response', (response, { event }) => {
    if (process.env.NODE_ENV !== 'production' || typeof response.body !== 'string') return
    const nonce = randomBytes(18).toString('base64')
    response.body = response.body.replace(/<script\b/g, `<script nonce="${nonce}"`)
    setHeader(event, 'Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://vercel.com/api/blob https://vercel.com/api/blob/ https://blob.vercel-storage.com https://*.blob.vercel-storage.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`)
  })
})
