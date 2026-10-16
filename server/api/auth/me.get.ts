import { getAuth } from '../../utils/auth'
export default defineEventHandler(async event => {
  const auth = await getAuth(event)
  return { user: auth?.user || null, csrf: auth?.csrf || '' }
})
