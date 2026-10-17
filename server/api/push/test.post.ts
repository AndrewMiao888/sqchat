import { requireAuth } from '../../utils/auth'
import { sendTestPush } from '../../utils/push'
export default defineEventHandler(async event => {
  const { hash } = await requireAuth(event)
  return sendTestPush(hash)
})
