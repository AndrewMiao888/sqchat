import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { requireAuth, checkCsrf, type AuthSession } from './auth'
import { store, audit, signal } from './store'
import type { GameBooster, GameBoosterId, GameProfile, GameUpgrade, GameUpgradeId } from '#shared/types/game'

export const MAX_GAME_LEVEL = 50
export const GAME_PROMO_CODE = 'SynQuara888'

export const GAME_BOOSTERS: GameBooster[] = [
  { id: 'shield', name: 'Guard rail', unlockLevel: 1, cost: 80, description: 'Survive one fall and snap back to the road.' },
  { id: 'magnet', name: 'Coin magnet', unlockLevel: 4, cost: 110, description: 'Pull nearby coins into your run.' },
  { id: 'overdrive', name: 'Overdrive', unlockLevel: 8, cost: 140, description: 'Start faster and earn a score bonus.' },
  { id: 'ghost', name: 'Ghost tyres', unlockLevel: 14, cost: 180, description: 'Ignore road edges for a short burst.' }
]

export const GAME_UPGRADES: GameUpgrade[] = [
  { id: 'grip', name: 'Grip', maxLevel: 5, baseCost: 120, description: 'Wider control through corners.' },
  { id: 'turbo', name: 'Turbo', maxLevel: 5, baseCost: 150, description: 'Higher racing speed and score gain.' },
  { id: 'magnet', name: 'Magnet', maxLevel: 5, baseCost: 130, description: 'Larger coin pickup radius.' },
  { id: 'shield', name: 'Shielding', maxLevel: 5, baseCost: 160, description: 'Longer booster protection.' }
]

const BOOSTER_IDS = GAME_BOOSTERS.map(item => item.id)
const UPGRADE_IDS = GAME_UPGRADES.map(item => item.id)

export async function requireGameAccess(event: H3Event): Promise<AuthSession> {
  const auth = await requireAuth(event)
  if (!auth.user.canPlayGame) throw createError({ statusCode: 403, statusMessage: 'Andrew has not approved game access for this account.' })
  return auth
}

export function currentGameSeed() {
  return `sq-drift-${new Date().toISOString().slice(0, 10)}`
}

export function nextRunId() {
  return randomUUID()
}

export function upgradeCost(upgrade: GameUpgrade, currentLevel: number) {
  return Math.round(upgrade.baseCost * Math.pow(1.55, currentLevel))
}

export function levelForXp(xp: number) {
  return Math.min(MAX_GAME_LEVEL, Math.max(1, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 95))))
}

export function cleanInt(value: unknown, min: number, max: number) {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : NaN
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min
}

function normalizeCountMap<T extends string>(value: unknown, ids: readonly T[], max: number): Record<T, number> {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(ids.map(id => [id, cleanInt(input[id], 0, max)])) as Record<T, number>
}

export function normalizeProfile(row: any): GameProfile {
  return {
    userId: row.user_id,
    level: cleanInt(row.level, 1, MAX_GAME_LEVEL),
    xp: cleanInt(row.xp, 0, 9_999_999),
    coins: cleanInt(row.coins, 0, 999_999),
    bestDistance: cleanInt(row.best_distance, 0, 9_999_999),
    maxCombo: cleanInt(row.max_combo, 0, 9_999),
    boosters: normalizeCountMap<GameBoosterId>(row.boosters, BOOSTER_IDS, 99),
    upgrades: normalizeCountMap<GameUpgradeId>(row.upgrades, UPGRADE_IDS, 5),
    promoCodeUsed: !!row.promo_code_used,
    updatedAt: new Date(row.updated_at).toISOString()
  }
}

export async function ensureGameProfile(userId: string) {
  const db = await store()
  const rows = await db`INSERT INTO sq_game_profiles (user_id, boosters, upgrades)
    VALUES (${userId}, '{"shield":2,"magnet":1,"overdrive":1,"ghost":0}'::jsonb, '{"grip":0,"turbo":0,"magnet":0,"shield":0}'::jsonb)
    ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING *`
  return normalizeProfile(rows[0])
}

export async function loadGameProfile(userId: string) {
  const db = await store()
  const rows = await db`SELECT * FROM sq_game_profiles WHERE user_id = ${userId}`
  return rows[0] ? normalizeProfile(rows[0]) : ensureGameProfile(userId)
}

export async function requireGameWrite(event: H3Event) {
  const auth = await requireGameAccess(event)
  checkCsrf(event, auth)
  return auth
}

export async function signalGame() {
  await signal()
}

export async function auditGame(actor: string, action: string) {
  await audit(actor, `game.${action}`, null)
}
