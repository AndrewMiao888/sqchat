import assert from 'node:assert/strict'
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'
const sql = neon(process.env.DATABASE_URL)
try {
  await sql.query("SELECT json_build_object('conversation', $1)", ['test'])
  console.log('Uncast parameter accepted')
} catch (error) {
  console.log('Original query:', error.code, error.message)
  assert.equal(error.code, '42P18')
}
const rows = await sql.query("SELECT json_build_object('conversation', $1::text) AS payload", ['test'])
assert.equal(rows[0].payload.conversation, 'test')
console.log('PASS: typed conversation notification payload')
// EXPLAIN validates the actual INSERT queries without writing messages or emitting notifications.
const source = readFileSync(new URL('../server/utils/chat.ts', import.meta.url), 'utf8')
const send = source.slice(source.indexOf('export async function addMessage'), source.indexOf('export async function updateMessage'))
const inserts = [...send.matchAll(/rows = await db`([\s\S]*?)`/g)]
assert.equal(inserts.length, 2)
for (const [index, match] of inserts.entries()) {
  const values = []
  const fixtures = { attachments: [], 'user.id': 'test-user', conversation: 'test-thread', id: 'test-message', body: 'test', 'JSON.stringify(effects)': '{}', replyTo: null, 'attachments.length': 0, 'user.name': 'Test' }
  const query = match[1].replace(/\$\{([^}]+)\}/g, (_, expression) => {
    assert.ok(expression in fixtures, expression)
    values.push(fixtures[expression])
    return `$${values.length}`
  })
  await sql.query(`EXPLAIN ${query}`, values)
  console.log(`PASS: actual ${index === 0 ? 'private' : 'shared'} message INSERT compiles`)
}
