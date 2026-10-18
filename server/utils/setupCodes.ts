import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { store } from './store'

let cachedKey: Promise<Buffer> | undefined
function archiveKey() {
  cachedKey ||= (async () => {
    const db = await store()
    await db`INSERT INTO sq_config (key, value) VALUES ('setup_code_archive_key', ${randomBytes(32).toString('base64url')}) ON CONFLICT DO NOTHING`
    const rows = await db`SELECT value FROM sq_config WHERE key = 'setup_code_archive_key'`
    const key = Buffer.from(rows[0]!.value, 'base64url')
    if (key.length !== 32) throw new Error('Setup code archive key is invalid')
    return key
  })().catch(error => { cachedKey = undefined; throw error })
  return cachedKey
}

export async function sealSetupCode(code: string) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', await archiveKey(), nonce)
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()])
  return [nonce, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.')
}

export async function openSetupCode(value: string) {
  const parts = value.split('.').map(part => Buffer.from(part, 'base64url'))
  if (parts.length !== 3 || parts[0]!.length !== 12 || parts[1]!.length !== 16) throw new Error('Invalid archived setup code')
  const decipher = createDecipheriv('aes-256-gcm', await archiveKey(), parts[0]!)
  decipher.setAuthTag(parts[1]!)
  return Buffer.concat([decipher.update(parts[2]!), decipher.final()]).toString('utf8')
}

export async function purgeExpiredSetupCodes() {
  const db = await store()
  await db`DELETE FROM sq_invites WHERE expires_at <= NOW()`
}
