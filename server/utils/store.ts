import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { randomUUID } from 'node:crypto'

let sql: NeonQueryFunction<false, false> | undefined
let ready: Promise<void> | undefined

// Additive migration: legacy group messages and settings remain intact.
export async function store() {
  if (!process.env.DATABASE_URL) throw createError({ statusCode: 503, statusMessage: 'Database is not configured.' })
  sql ||= neon(process.env.DATABASE_URL)
  const db = sql
  ready ||= (async () => {
    await db`CREATE TABLE IF NOT EXISTS sq_users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
      builtin BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','active','disabled')),
      password_hash TEXT, password_change_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
    await Promise.all([
      db`CREATE TABLE IF NOT EXISTS sq_sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES sq_users(id),
        csrf TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL
      )`,
      db`CREATE TABLE IF NOT EXISTS sq_invites (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES sq_users(id),
        expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      db`CREATE TABLE IF NOT EXISTS sq_threads (
        id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL REFERENCES sq_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      db`CREATE TABLE IF NOT EXISTS sq_limits (
        key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
      )`,
      db`CREATE TABLE IF NOT EXISTS sq_audit (
        id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      db`CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY, sender TEXT NOT NULL, body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), edited_at TIMESTAMPTZ
      )`,
      db`CREATE TABLE IF NOT EXISTS chat_settings (id BOOLEAN PRIMARY KEY DEFAULT TRUE, data JSONB NOT NULL)`,
      db`CREATE TABLE IF NOT EXISTS chat_people (name_key TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
    ])
    await db`CREATE TABLE IF NOT EXISTS sq_thread_members (
      thread_id TEXT NOT NULL REFERENCES sq_threads(id), user_id TEXT NOT NULL REFERENCES sq_users(id),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (thread_id, user_id)
    )`
    await Promise.all([
      db`ALTER TABLE sq_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0`,
      db`ALTER TABLE sq_sessions ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0`,
      db`CREATE TABLE IF NOT EXISTS sq_streams (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES sq_users(id), expires_at TIMESTAMPTZ NOT NULL
      )`
    ])
    await db`CREATE TABLE IF NOT EXISTS sq_private_messages (
      id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES sq_threads(id),
      sender_id TEXT NOT NULL REFERENCES sq_users(id), body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), edited_at TIMESTAMPTZ
    )`
    await Promise.all([
      db`CREATE INDEX IF NOT EXISTS sq_private_timeline ON sq_private_messages(thread_id, created_at DESC, id DESC)`,
      db`CREATE INDEX IF NOT EXISTS sq_sessions_user ON sq_sessions(user_id)`,
      db`CREATE INDEX IF NOT EXISTS sq_invites_user ON sq_invites(user_id)`,
      db`CREATE INDEX IF NOT EXISTS sq_audit_timeline ON sq_audit(created_at DESC)`,
      db`CREATE INDEX IF NOT EXISTS chat_timeline ON chat_messages(created_at DESC, id DESC)`
    ])
    for (const name of ['Andrew', 'Darius', 'Harrison']) {
      await db`INSERT INTO sq_users (id, name, name_key, role, builtin)
        VALUES (${randomUUID()}, ${name}, ${name.toLowerCase()}, ${name === 'Andrew' ? 'admin' : 'member'}, TRUE)
        ON CONFLICT (name_key) DO NOTHING`
    }
    await db`INSERT INTO sq_users (id, name, name_key)
      SELECT 'legacy-' || name_key, name, name_key FROM chat_people
      ON CONFLICT (name_key) DO NOTHING`
  })().catch(error => { ready = undefined; throw error })
  await ready
  return db
}

export async function audit(actor: string | null, action: string, target: string | null = null) {
  const db = await store()
  await db`INSERT INTO sq_audit (id, actor_id, action, target) VALUES (${randomUUID()}, ${actor}, ${action}, ${target})`
}

export async function signal(users?: string[]) {
  const db = await store()
  await db`SELECT pg_notify('sqchat_changes', ${users ? JSON.stringify({ users }) : 'change'})`
}
