import { requireAuth } from '../utils/auth'
import { store } from '../utils/store'
import { validSubscription } from '../utils/push'
export default defineEventHandler(async event => {
  const { hash } = await requireAuth(event)
  const input = await readBody(event)
  if (!validSubscription(input)) throw createError({ statusCode: 400, statusMessage: 'This device supplied an unsupported notification subscription.' })
  const db = await store()
  // One subscription per sign-in; an endpoint moves to the account currently using this browser.
  await db.transaction([
    db`DELETE FROM sq_push WHERE session_hash = ${hash} AND endpoint <> ${input.endpoint}`,
    db`INSERT INTO sq_push (endpoint, session_hash, subscription) VALUES (${input.endpoint}, ${hash}, ${JSON.stringify(input)}::jsonb)
      ON CONFLICT (endpoint) DO UPDATE SET session_hash = EXCLUDED.session_hash, subscription = EXCLUDED.subscription`
  ])
  return { enabled: true }
})
