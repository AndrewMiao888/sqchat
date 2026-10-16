import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto'

const N = 131072
let running = 0
export const token = () => randomBytes(32).toString('base64url')
export const digest = (value: string) => createHash('sha256').update(value).digest('hex')

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (running >= 3) throw createError({ statusCode: 503, statusMessage: 'Sign-in is busy. Please try again shortly.' })
  running++
  try {
    return await new Promise((resolve, reject) => scrypt(password, salt, 64, { N, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result)))
  } finally { running-- }
}

export function validatePassword(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
    throw createError({ statusCode: 400, statusMessage: 'Use a password or passphrase between 12 and 128 characters.' })
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${(await derive(password, salt)).toString('hex')}`
}

export async function verifyPassword(password: unknown, hash?: string | null) {
  if (typeof password !== 'string' || password.length > 128) return false
  const parts = hash?.split('$')
  const valid = parts?.length === 3 && parts[0] === 'scrypt' && /^[a-f0-9]{32}$/.test(parts[1]!) && /^[a-f0-9]{128}$/.test(parts[2]!)
  // Unknown accounts incur the same expensive derivation as known accounts.
  const result = await derive(password, valid ? Buffer.from(parts[1]!, 'hex') : Buffer.alloc(16))
  return !!valid && timingSafeEqual(result, Buffer.from(parts![2]!, 'hex'))
}
