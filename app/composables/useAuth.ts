import type { AuthState } from '#shared/types/auth'
import type { $Fetch } from 'ofetch'

export function useAuth() {
  const auth = useState<AuthState>('auth', () => ({ user: null, csrf: '' }))
  const loadVersion = useState('auth-load-version', () => 0)
  const request = useRequestFetch() as $Fetch
  async function load() {
    const version = ++loadVersion.value
    const next = await request<AuthState>('/api/auth/me')
    if (version === loadVersion.value) auth.value = next
    return auth.value.user
  }
  async function api<T = any>(path: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; body?: any; query?: Record<string, string> } = {}): Promise<T> {
    try {
      return await request<T>(path, { ...options, headers: { 'X-Requested-With': 'SQChat', 'X-SQ-CSRF': auth.value.csrf, 'Content-Type': 'application/json' } }) as T
    } catch (error: any) {
      if (error?.statusCode === 401 && !path.startsWith('/api/auth/login')) {
        auth.value = { user: null, csrf: '' }
        clearNuxtData()
        await navigateTo('/login')
      }
      throw error
    }
  }
  async function logout(all = false) {
    loadVersion.value++
    await api(all ? '/api/auth/revoke' : '/api/auth/logout', { method: 'POST', body: {} })
    auth.value = { user: null, csrf: '' }
    clearNuxtData()
    await navigateTo('/login')
  }
  return { auth, load, api, logout }
}
