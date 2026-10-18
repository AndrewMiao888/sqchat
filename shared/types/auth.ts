export interface Account {
  id: string
  name: string
  role: 'admin' | 'member'
  builtin: boolean
  privateOnly: boolean
  homeConversation: string | null
  lastConversation: string | null
  chatSort: 'viewed' | 'contributed'
  status: 'pending' | 'approved' | 'active' | 'disabled'
  canChangePassword: boolean
}
export interface AuthState { user: Account | null; csrf: string }
export interface Conversation {
  id: string
  title: string
  members: { id: string; name: string; active: boolean }[]
}
