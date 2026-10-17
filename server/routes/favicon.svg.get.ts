import { store } from '../utils/store'
export default defineEventHandler(async event => {
  const query = getQuery(event)
  let color = typeof query.accent === 'string' ? query.accent : ''
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    try { const db = await store(); const rows = await db`SELECT data FROM chat_settings WHERE id = TRUE`; color = rows[0]?.data?.accentColor || '' } catch {}
  }
  if (!/^#[0-9a-f]{6}$/i.test(color)) color = '#52745a'
  setHeader(event, 'Content-Type', 'image/svg+xml')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="17" fill="${color}"/><g fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M27 21h-8a6 6 0 0 0 0 12h2a6 6 0 0 1 0 12h-8M37 27a7 7 0 0 1 14 0v12a7 7 0 0 1-14 0zM45 39l8 8"/></g></svg>`
})
