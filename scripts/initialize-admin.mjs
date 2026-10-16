// Run once after the app has created its tables. The supplied secret stays out of source and output.
import { neon } from '@neondatabase/serverless'
import { randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'
const password = process.env.SQ_ADMIN_INITIAL_PASSWORD
if (!password || password.length < 10 || password.length > 128 || !process.env.DATABASE_URL) throw new Error('Set DATABASE_URL and SQ_ADMIN_INITIAL_PASSWORD for this one-time command.')
const salt = randomBytes(16)
const key = await promisify(scrypt)(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 })
const hash = `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
const sql = neon(process.env.DATABASE_URL)
const rows = await sql`UPDATE sq_users SET password_hash = ${hash}, status = 'active'
  WHERE name_key = 'andrew' AND role = 'admin' AND builtin AND status = 'pending' AND password_hash IS NULL RETURNING id`
console.log(rows.length ? 'Andrew initialized. The password was hashed and was not logged.' : 'No change: Andrew is already initialized, or the app tables have not been seeded.')
