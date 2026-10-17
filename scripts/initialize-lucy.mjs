// One-time private account provisioning. Supply the password through the environment.
import { neon } from '@neondatabase/serverless'
import { randomUUID, randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'
const password = process.env.SQ_LUCY_INITIAL_PASSWORD
if (!password || password.length < 10 || !process.env.DATABASE_URL) throw new Error('Set DATABASE_URL and SQ_LUCY_INITIAL_PASSWORD.')
const sql = neon(process.env.DATABASE_URL)
const existing = await sql`SELECT id, status, private_only, password_hash IS NOT NULL AS has_password FROM sq_users WHERE name_key = 'lucy'`
if (existing[0]?.private_only && existing[0]?.has_password) { console.log('Lucy is already initialized. No credentials or conversations changed.'); process.exit(0) }
if (existing[0]?.has_password) throw new Error('Lucy already has a password; review the existing account before initializing.')
const salt = randomBytes(16)
const key = await promisify(scrypt)(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 })
const hash = `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
const [andrew] = await sql`SELECT id FROM sq_users WHERE name_key = 'andrew' AND role = 'admin'`
if (!andrew) throw new Error('Initialize Andrew first.')
const id = existing[0]?.id || randomUUID(), thread = randomUUID()
await sql.transaction([
  sql`INSERT INTO sq_users (id, name, name_key, role, builtin, status, password_hash, private_only, home_thread)
    VALUES (${id}, 'Lucy', 'lucy', 'member', TRUE, 'active', ${hash}, TRUE, ${thread})
    ON CONFLICT (name_key) DO UPDATE SET builtin = TRUE, status = 'active', password_hash = EXCLUDED.password_hash, private_only = TRUE, home_thread = EXCLUDED.home_thread, session_version = sq_users.session_version + 1 WHERE sq_users.password_hash IS NULL`,
  sql`INSERT INTO sq_threads (id, title, created_by) VALUES (${thread}, '', ${andrew.id})`,
  sql`INSERT INTO sq_thread_members (thread_id, user_id) VALUES (${thread}, ${andrew.id}), (${thread}, ${id})`,
  sql`INSERT INTO sq_audit (id, actor_id, action, target) VALUES (${randomUUID()}, ${andrew.id}, 'account.initialized-private', ${id})`,
  sql`SELECT pg_notify('sqchat_changes', 'change')`
])
console.log('Lucy is ready, with a private Andrew conversation and no shared-room access. Password was hashed and not logged.')
