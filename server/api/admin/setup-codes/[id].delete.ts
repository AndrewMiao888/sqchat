import { requireAdmin } from '../../../utils/auth'
import { store, audit, signal } from '../../../utils/store'
import { purgeExpiredSetupCodes } from '../../../utils/setupCodes'

export default defineEventHandler(async event => {
  const { user } = await requireAdmin(event)
  const id = getRouterParam(event, 'id') || ''
  if (!/^[0-9a-f-]{36}$/.test(id)) throw createError({ statusCode: 400, statusMessage: 'Choose a setup code to delete.' })
  await purgeExpiredSetupCodes()
  const db = await store()
  const rows = await db`DELETE FROM sq_invites WHERE id = ${id} RETURNING user_id`
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: 'This setup code has expired or was already deleted.' })
  await audit(user.id, 'setup-code.deleted', rows[0]!.user_id)
  await signal()
  return { ok: true }
})
