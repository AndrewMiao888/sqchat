import { currentGameSeed, cleanInt, levelForXp, loadGameProfile, nextRunId, requireGameWrite, signalGame } from '../../utils/game'
import { store } from '../../utils/store'

export default defineEventHandler(async event => {
  const { user } = await requireGameWrite(event)
  const input = await readBody(event)
  const db = await store()
  const seed = currentGameSeed()
  if (input?.action === 'start') {
    const runId = nextRunId()
    const profile = await loadGameProfile(user.id)
    await db`INSERT INTO sq_game_races (user_id, seed, run_id, distance, score, level, status, updated_at)
      VALUES (${user.id}, ${seed}, ${runId}, 0, 0, ${profile.level}, 'racing', NOW())
      ON CONFLICT (user_id) DO UPDATE SET seed = EXCLUDED.seed, run_id = EXCLUDED.run_id, distance = 0, score = 0, level = EXCLUDED.level, status = 'racing', updated_at = NOW()`
    await signalGame()
    return { runId, seed }
  }
  const runId = typeof input?.runId === 'string' && input.runId.length <= 80 ? input.runId : ''
  if (!runId) throw createError({ statusCode: 400, statusMessage: 'Missing race run.' })
  const distance = cleanInt(input?.distance, 0, 9_999_999)
  const score = cleanInt(input?.score, 0, 999_999_999)
  if (input?.action === 'progress') {
    await db`UPDATE sq_game_races SET distance = GREATEST(distance, ${distance}), score = GREATEST(score, ${score}), updated_at = NOW()
      WHERE user_id = ${user.id} AND seed = ${seed} AND run_id = ${runId} AND status = 'racing'`
    return { ok: true }
  }
  if (input?.action !== 'finish') throw createError({ statusCode: 400, statusMessage: 'Choose a valid race action.' })
  const coins = cleanInt(input?.coins, 0, 20_000)
  const combo = cleanInt(input?.combo, 0, 9_999)
  const crashed = input?.crashed !== false
  const usedBoosters = input?.boosters && typeof input.boosters === 'object' ? input.boosters as Record<string, unknown> : {}
  const shield = cleanInt(usedBoosters.shield, 0, 5)
  const magnet = cleanInt(usedBoosters.magnet, 0, 5)
  const overdrive = cleanInt(usedBoosters.overdrive, 0, 5)
  const ghost = cleanInt(usedBoosters.ghost, 0, 5)
  const xpGain = Math.min(80_000, Math.floor(score / 12) + Math.floor(distance / 4) + combo * 5)
  const current = await loadGameProfile(user.id)
  const nextXp = current.xp + xpGain
  const nextLevel = Math.max(current.level, levelForXp(nextXp))
  await db.transaction([
    db`UPDATE sq_game_races SET distance = GREATEST(distance, ${distance}), score = GREATEST(score, ${score}), status = ${crashed ? 'crashed' : 'finished'}, updated_at = NOW()
      WHERE user_id = ${user.id} AND seed = ${seed} AND run_id = ${runId}`,
    db`UPDATE sq_game_profiles SET
        xp = LEAST(9999999, xp + ${xpGain}),
        level = GREATEST(level, ${nextLevel}),
        coins = LEAST(999999, GREATEST(0, coins + ${coins})),
        best_distance = GREATEST(best_distance, ${distance}),
        max_combo = GREATEST(max_combo, ${combo}),
        boosters = jsonb_build_object(
          'shield', GREATEST(0, COALESCE((boosters->>'shield')::int, 0) - ${shield}),
          'magnet', GREATEST(0, COALESCE((boosters->>'magnet')::int, 0) - ${magnet}),
          'overdrive', GREATEST(0, COALESCE((boosters->>'overdrive')::int, 0) - ${overdrive}),
          'ghost', GREATEST(0, COALESCE((boosters->>'ghost')::int, 0) - ${ghost})
        ),
        updated_at = NOW()
      WHERE user_id = ${user.id}`
  ])
  await signalGame()
  return { ok: true, xpGain, level: nextLevel }
})
