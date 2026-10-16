export const PEOPLE = ['Andrew', 'Darius', 'Harrison'] as const

export type Person = typeof PEOPLE[number]

export interface ChatMessage {
  id: string
  sender: Person
  body: string
  createdAt: string
  editedAt?: string
}

export interface ChatSettings {
  title: string
  subtitle: string
  notice: string
  welcome: string
}

export interface ChatState {
  messages: ChatMessage[]
  settings: ChatSettings
}

export const DEFAULT_SETTINGS: ChatSettings = {
  title: 'The group chat',
  subtitle: 'A little space for Andrew, Darius and Harrison.',
  notice: 'Make yourself at home. Pick your name and say hello.',
  welcome: 'The conversation starts here.'
}
