export const TEXT_EFFECTS = ['big', 'small', 'shake', 'nod', 'explode', 'ripple', 'bloom', 'jitter'] as const
export const BUBBLE_EFFECTS = ['slam', 'loud', 'gentle', 'invisible'] as const
export const SCREEN_EFFECTS = ['echo', 'spotlight', 'balloons', 'confetti', 'love', 'lasers', 'fireworks', 'celebration'] as const
export type TextEffect = typeof TEXT_EFFECTS[number]
export type BubbleEffect = typeof BUBBLE_EFFECTS[number]
export type ScreenEffect = typeof SCREEN_EFFECTS[number]
export interface MessageEffects {
  text?: { start: number; end: number; effect: TextEffect }[]
  bubble?: BubbleEffect
  screen?: ScreenEffect
}
export interface Attachment { id: string; name: string; type: string; size: number }
export const MAX_FILE_SIZE = 20 * 1024 * 1024
export const MAX_ATTACHMENTS = 4
export const FILE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/plain', csv: 'text/csv', zip: 'application/zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}
export const FILE_ACCEPT = Object.keys(FILE_TYPES).map(extension => `.${extension}`).join(',')
export function fileSize(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB` }
