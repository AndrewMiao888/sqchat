export type GameBoosterId = 'shield' | 'magnet' | 'overdrive' | 'ghost'
export type GameUpgradeId = 'grip' | 'turbo' | 'magnet' | 'shield'

export interface GameProfile {
  userId: string
  level: number
  xp: number
  coins: number
  bestDistance: number
  maxCombo: number
  boosters: Record<GameBoosterId, number>
  upgrades: Record<GameUpgradeId, number>
  promoCodeUsed: boolean
  updatedAt: string
}

export interface GameBooster {
  id: GameBoosterId
  name: string
  unlockLevel: number
  cost: number
  description: string
}

export interface GameUpgrade {
  id: GameUpgradeId
  name: string
  maxLevel: number
  baseCost: number
  description: string
}

export interface GameRacer {
  userId: string
  name: string
  distance: number
  score: number
  level: number
  status: 'racing' | 'finished' | 'crashed'
  updatedAt: string
}

export interface GameLeaderboardEntry {
  userId: string
  name: string
  level: number
  bestDistance: number
  maxCombo: number
}

export interface GameState {
  profile: GameProfile
  seed: string
  maxLevel: number
  boosters: GameBooster[]
  upgrades: GameUpgrade[]
  racers: GameRacer[]
  leaderboard: GameLeaderboardEntry[]
}
