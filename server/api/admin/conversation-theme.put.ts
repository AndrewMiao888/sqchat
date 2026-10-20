import { del } from '@vercel/blob'
import { requireCmsEditor } from '../../utils/auth'
import { findThread } from '../../utils/chat'
import { store, audit } from '../../utils/store'
import { DEFAULT_CONVERSATION_THEME, type ConversationTheme } from '#shared/types/chat'

const validColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

export default defineEventHandler(async event => {
  const { user } = await requireCmsEditor(event)
  const input = await readBody(event)
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw createError({ statusCode: 400, statusMessage: 'Choose appearance settings to save.' })
  const conversation = typeof input?.conversation === 'string' && input.conversation ? input.conversation : null
  const thread = conversation ? await findThread(user, conversation) : null
  if (!thread && user.privateOnly) throw createError({ statusCode: 403, statusMessage: 'This account uses private conversations only.' })
  const db = await store()
  const participantIds = thread
    ? thread.members.map(member => member.id)
    : (await db`SELECT id FROM sq_users WHERE status = 'active' AND private_only = FALSE`).map(row => row.id as string)
  const mode = input?.backgroundMode
  const angle = input?.gradientAngle
  if (!['solid', 'gradient', 'image'].includes(mode)
    || !validColor(input?.backgroundStart) || !validColor(input?.backgroundEnd)
    || !validColor(input?.panelColor) || !validColor(input?.bubbleColor) || !validColor(input?.accentColor)
    || !Number.isInteger(angle) || angle < 0 || angle > 360) {
    throw createError({ statusCode: 400, statusMessage: 'Check the appearance colours, background type and gradient angle.' })
  }
  const senderColors: Record<string, string> = {}
  if (input.senderColors !== undefined && (!input.senderColors || typeof input.senderColors !== 'object' || Array.isArray(input.senderColors))) {
    throw createError({ statusCode: 400, statusMessage: 'Choose valid member message colours.' })
  }
  for (const [memberId, color] of Object.entries(input.senderColors || {})) {
    if (Object.keys(senderColors).length >= 100 || !participantIds.includes(memberId) || !validColor(color)) {
      throw createError({ statusCode: 400, statusMessage: 'Choose valid message colours for people in this conversation.' })
    }
    senderColors[memberId] = color
  }
  const imageId = input.backgroundImageId === null || input.backgroundImageId === undefined ? null : input.backgroundImageId
  if (imageId !== null && (typeof imageId !== 'string' || !/^[0-9a-f-]{36}$/i.test(imageId))) {
    throw createError({ statusCode: 400, statusMessage: 'Choose a valid background image.' })
  }
  if (mode === 'image' && !imageId) throw createError({ statusCode: 400, statusMessage: 'Upload a picture before choosing picture background.' })
  if (imageId) {
    const files = await db`SELECT id FROM sq_attachments WHERE id = ${imageId} AND purpose = 'theme' AND status = 'theme'
      AND thread_id IS NOT DISTINCT FROM ${conversation}`
    if (!files.length) throw createError({ statusCode: 400, statusMessage: 'That picture is not available for this conversation.' })
  }
  const theme: ConversationTheme = {
    backgroundMode: mode,
    backgroundStart: input.backgroundStart,
    backgroundEnd: input.backgroundEnd,
    gradientAngle: angle,
    panelColor: input.panelColor,
    bubbleColor: input.bubbleColor,
    accentColor: input.accentColor,
    senderColors,
    backgroundImageId: imageId
  }
  const key = conversation || 'shared'
  const previous = await db`SELECT data->>'backgroundImageId' AS image_id FROM sq_conversation_themes WHERE conversation_key = ${key}`
  await db`INSERT INTO sq_conversation_themes (conversation_key, data, updated_at) VALUES (${key}, ${JSON.stringify(theme)}::jsonb, NOW())
    ON CONFLICT (conversation_key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`
  if (previous[0]?.image_id && previous[0].image_id !== imageId) {
    const obsolete = await db`UPDATE sq_attachments SET status = 'deleted'
      WHERE id = ${previous[0].image_id} AND purpose = 'theme' AND status = 'theme'
        AND NOT EXISTS (SELECT 1 FROM sq_conversation_themes WHERE data->>'backgroundImageId' = ${previous[0].image_id})
      RETURNING blob_path`
    if (obsolete[0]) await del(obsolete[0].blob_path).catch(() => {})
  }
  const payload = thread
    ? { conversation: thread.id, users: thread.members.map(member => member.id), appearance: true }
    : { conversation: null, appearance: true }
  await db`SELECT pg_notify('sqchat_changes', ${JSON.stringify(payload)})`
  await audit(user.id, 'conversation.appearance.updated', key)
  return { theme: { ...DEFAULT_CONVERSATION_THEME, ...theme } }
})
