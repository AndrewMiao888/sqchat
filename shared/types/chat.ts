import type { Conversation } from './auth'
import type { Attachment, MessageEffects } from './media'
export const PEOPLE = ['Andrew', 'Darius', 'Harrison'] as const

export type Person = string

export interface ChatMessage {
  id: string
  sender: Person
  body: string
  createdAt: string
  editedAt?: string
  attachments?: Attachment[]
  effects?: MessageEffects
}

export interface ChatSettings {
  title: string
  subtitle: string
  notice: string
  welcome: string
  pageBackground: string
  panelBackground: string
  bubbleBackground: string
  accentColor: string
  textColor: string
  fontFamily: 'sans' | 'rounded' | 'serif' | 'mono'
  messageAnimation: 'pop' | 'bubble' | 'slide' | 'none'
  textAnimation: 'fade' | 'rise' | 'reveal' | 'none'
  bubbleStyle: 'soft' | 'pill' | 'square'
}

export interface ChatState {
  messages: ChatMessage[]
  people: Person[]
  settings: ChatSettings
  members: { id: string; name: string }[]
  conversations: Conversation[]
  conversation: string | null
  canSend: boolean
}

export const DEFAULT_SETTINGS: ChatSettings = {
  title: 'The group chat',
  subtitle: 'A little space for Andrew, Darius and Harrison.',
  notice: 'Make yourself at home. Say hello to the group or start a private conversation.',
  welcome: 'The conversation starts here.',
  pageBackground: '#f7f6f2',
  panelBackground: '#ffffff',
  bubbleBackground: '#f5f6f2',
  accentColor: '#52745a',
  textColor: '#252923',
  fontFamily: 'sans',
  messageAnimation: 'pop',
  textAnimation: 'fade',
  bubbleStyle: 'soft'
}
