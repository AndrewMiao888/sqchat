import { GAME_BOOSTERS, GAME_UPGRADES, cleanInt, loadGameProfile, requireGameWrite, signalGame, upgradeCost } from '../../utils/game'
import { store } from '../../utils/store'

export default defineEventHandler(async event => {
  const { user } = await requireGameWrite(event)
  const input = await readBody(event)
  const db = await store()
  const profile = await loadGameProfile(user.id)
  if (input?.type === 'booster') {
    const booster = GAME_BOOSTERS.find(item => item.id === input.id)
    if (!booster) throw createError({ statusCode: 400, statusMessage: 'Choose a valid booster.' })
    if (profile.level < booster.unlockLevel) throw createError({ statusCode: 403, statusMessage: 'Reach the unlock level first.' })
    if (profile.coins < booster.cost) throw createError({ statusCode: 409, statusMessage: 'Not enough coins yet.' })
    const current = cleanInt(profile.boosters[booster.id], 0, 99)
    await db`UPDATE sq_game_profiles SET coins = coins - ${booster.cost},
      boosters = jsonb_set(boosters, ARRAY[${booster.id}], to_jsonb(${Math.min(99, current + 1)}::int), true), updated_at = NOW()
      WHERE user_id = ${user.id} AND coins >= ${booster.cost}`
    await signalGame()
    return { ok: true }
  }
  if (input?.type === 'upgrade') {
    const upgrade = GAME_UPGRADES.find(item => item.id === input.id)
    if (!upgrade) throw createError({ statusCode: 400, statusMessage: 'Choose a valid upgrade.' })
    const current = cleanInt(profile.upgrades[upgrade.id], 0, upgrade.maxLevel)
    if (current >= upgrade.maxLevel) throw createError({ statusCode: 409, statusMessage: 'That upgrade is already maxed.' })
    const cost = upgradeCost(upgrade, current)
    if (profile.coins < cost) throw createError({ statusCode: 409, statusMessage: 'Not enough coins yet.' })
    await db`UPDATE sq_game_profiles SET coins = coins - ${cost},
      upgrades = jsonb_set(upgrades, ARRAY[${upgrade.id}], to_jsonb(${current + 1}::int), true), updated_at = NOW()
      WHERE user_id = ${user.id} AND coins >= ${cost}`
    await signalGame()
    return { ok: true }
  }
  throw createError({ statusCode: 400, statusMessage: 'Choose something from the shop.' })
})
