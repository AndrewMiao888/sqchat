import { GAME_BOOSTERS, GAME_PROMO_CODE, GAME_UPGRADES, MAX_GAME_LEVEL, auditGame, ensureGameProfile, requireGameWrite, signalGame } from '../../utils/game'
import { store } from '../../utils/store'

export default defineEventHandler(async event => {
  const { user } = await requireGameWrite(event)
  const input = await readBody(event)
  if (typeof input?.code !== 'string' || input.code.trim() !== GAME_PROMO_CODE) {
    throw createError({ statusCode: 400, statusMessage: 'That code did not work.' })
  }
  await ensureGameProfile(user.id)
  const maxedUpgrades = Object.fromEntries(GAME_UPGRADES.map(item => [item.id, item.maxLevel]))
  const stockedBoosters = Object.fromEntries(GAME_BOOSTERS.map(item => [item.id, 25]))
  const db = await store()
  const rows = await db`UPDATE sq_game_profiles SET
      level = ${MAX_GAME_LEVEL},
      xp = GREATEST(xp, 240000),
      coins = GREATEST(coins, 88888),
      boosters = ${JSON.stringify(stockedBoosters)}::jsonb,
      upgrades = ${JSON.stringify(maxedUpgrades)}::jsonb,
      promo_code_used = TRUE,
      updated_at = NOW()
    WHERE user_id = ${user.id} AND promo_code_used = FALSE RETURNING user_id`
  if (!rows.length) throw createError({ statusCode: 409, statusMessage: 'This account has already used that code.' })
  await auditGame(user.id, 'promo-code')
  await signalGame()
  return { ok: true }
})
