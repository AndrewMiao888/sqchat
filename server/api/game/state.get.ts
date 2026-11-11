import { GAME_BOOSTERS, GAME_UPGRADES, MAX_GAME_LEVEL, currentGameSeed, ensureGameProfile, requireGameAccess } from '../../utils/game'
import { store } from '../../utils/store'
import type { GameState } from '#shared/types/game'

export default defineEventHandler(async (event): Promise<GameState> => {
  setHeader(event, 'Cache-Control', 'no-store')
  const { user } = await requireGameAccess(event)
  const db = await store()
  const profile = await ensureGameProfile(user.id)
  const seed = currentGameSeed()
  const [racers, leaders] = await Promise.all([
    db`SELECT r.user_id, u.name, r.distance, r.score, r.level, r.status, r.updated_at
      FROM sq_game_races r JOIN sq_users u ON u.id = r.user_id
      WHERE r.seed = ${seed} AND r.updated_at > NOW() - INTERVAL '45 seconds'
        AND u.status = 'active' AND (u.game_access OR u.role = 'admin')
      ORDER BY r.distance DESC, r.score DESC, u.name`,
    db`SELECT u.id AS user_id, u.name, p.level, p.best_distance, p.max_combo
      FROM sq_game_profiles p JOIN sq_users u ON u.id = p.user_id
      WHERE u.status = 'active' AND (u.game_access OR u.role = 'admin')
      ORDER BY p.best_distance DESC, p.max_combo DESC, u.name LIMIT 10`
  ])
  return {
    profile,
    seed,
    maxLevel: MAX_GAME_LEVEL,
    boosters: GAME_BOOSTERS,
    upgrades: GAME_UPGRADES,
    racers: racers.map(row => ({ userId: row.user_id, name: row.name, distance: Number(row.distance), score: Number(row.score), level: Number(row.level), status: row.status, updatedAt: new Date(row.updated_at).toISOString() })),
    leaderboard: leaders.map(row => ({ userId: row.user_id, name: row.name, level: Number(row.level), bestDistance: Number(row.best_distance), maxCombo: Number(row.max_combo) }))
  }
})
