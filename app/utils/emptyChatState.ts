import { DEFAULT_CONVERSATION_THEME, DEFAULT_SETTINGS, type ChatState } from '#shared/types/chat'
export function emptyChatState(): ChatState {
  return { messages: [], people: [], members: [], conversations: [], conversation: null, canSend: false, settings: { ...DEFAULT_SETTINGS }, theme: { ...DEFAULT_CONVERSATION_THEME, senderColors: {} } }
}
