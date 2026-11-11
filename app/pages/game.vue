<script setup lang="ts">
import type { GameBoosterId, GameState, GameUpgradeId } from '#shared/types/game'

definePageMeta({ middleware: 'auth' })

type TrackPoint = { x: number; y: number }
type DriftRun = {
  status: 'ready' | 'running' | 'finished' | 'crashed'
  runId: string
  segment: number
  progress: number
  lateral: number
  distance: number
  score: number
  coins: number
  combo: number
  bestCombo: number
  shield: number
  ghostTime: number
  startedAt: number
  message: string
}

const boosterIds: GameBoosterId[] = ['shield', 'magnet', 'overdrive', 'ghost']
const upgradeIds: GameUpgradeId[] = ['grip', 'turbo', 'magnet', 'shield']
const blankGameState = (): GameState => ({
  profile: {
    userId: '',
    level: 1,
    xp: 0,
    coins: 0,
    bestDistance: 0,
    maxCombo: 0,
    boosters: { shield: 0, magnet: 0, overdrive: 0, ghost: 0 },
    upgrades: { grip: 0, turbo: 0, magnet: 0, shield: 0 },
    promoCodeUsed: false,
    updatedAt: new Date(0).toISOString()
  },
  seed: '',
  maxLevel: 50,
  boosters: [],
  upgrades: [],
  racers: [],
  leaderboard: []
})

const { auth, api } = useAuth()
const { data, refresh, error } = await useAsyncData('game-state', () => api<GameState>('/api/game/state'), { default: blankGameState })
const canvas = ref<HTMLCanvasElement | null>(null)
const selectedBoosters = ref<GameBoosterId[]>([])
const selectedLevel = ref(1)
const promoCode = ref('')
const feedback = ref('')
const failure = ref('')
const busyShop = ref('')
const claiming = ref(false)
const track = ref<TrackPoint[]>([])
const coins = ref<Set<number>>(new Set())
const usedBoosters = ref<Record<GameBoosterId, number>>({ shield: 0, magnet: 0, overdrive: 0, ghost: 0 })
const pressed = ref(false)
const run = reactive<DriftRun>({
  status: 'ready',
  runId: '',
  segment: 0,
  progress: 0,
  lateral: 0,
  distance: 0,
  score: 0,
  coins: 0,
  combo: 0,
  bestCombo: 0,
  shield: 0,
  ghostTime: 0,
  startedAt: 0,
  message: 'Ready'
})

let frame = 0
let lastFrame = 0
let lastProgressPost = 0
let refreshTimer: ReturnType<typeof setInterval> | undefined
const keyDown = (event: KeyboardEvent) => onKey(event, true)
const keyUp = (event: KeyboardEvent) => onKey(event, false)

const profile = computed(() => data.value.profile)
const canStart = computed(() => !error.value && run.status !== 'running')
const levelOptions = computed(() => Array.from({ length: Math.max(1, profile.value.level) }, (_, index) => index + 1))
const levelProgress = computed(() => Math.min(100, Math.round((profile.value.level / data.value.maxLevel) * 100)))
const sortedRacers = computed(() => [...data.value.racers].sort((a, b) => b.distance - a.distance))
const bestLiveDistance = computed(() => Math.max(1, ...sortedRacers.value.map(racer => racer.distance), run.distance))

watch(() => profile.value.level, level => {
  selectedLevel.value = Math.min(Math.max(1, selectedLevel.value || level), level || 1)
}, { immediate: true })

function hashSeed(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function randomFrom(seed: string) {
  let value = hashSeed(seed)
  return () => {
    value += 0x6D2B79F5
    let next = Math.imul(value ^ value >>> 15, value | 1)
    next ^= next + Math.imul(next ^ next >>> 7, next | 61)
    return ((next ^ next >>> 14) >>> 0) / 4294967296
  }
}

function generateTrack(seed: string) {
  const random = randomFrom(seed)
  const points: TrackPoint[] = [{ x: 0, y: 0 }]
  const dirs: TrackPoint[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
  let direction = 0
  let straight = 2
  for (let index = 0; index < 520; index++) {
    if (straight <= 0) {
      const roll = random()
      direction = (direction + (roll < 0.46 ? 1 : roll < 0.92 ? 3 : 0)) % 4
      straight = 2 + Math.floor(random() * 4)
    }
    const last = points.at(-1)!
    const dir = dirs[direction] || dirs[0]!
    points.push({ x: last.x + dir.x, y: last.y + dir.y })
    straight--
  }
  return points
}

function segmentDirection(index: number) {
  const start = track.value[index] || track.value[0] || { x: 0, y: 0 }
  const end = track.value[index + 1] || start
  return { x: Math.sign(end.x - start.x), y: Math.sign(end.y - start.y) }
}

function carPosition() {
  const start = track.value[run.segment] || { x: 0, y: 0 }
  const dir = segmentDirection(run.segment)
  const perp = { x: -dir.y, y: dir.x }
  return {
    x: start.x + dir.x * run.progress + perp.x * run.lateral,
    y: start.y + dir.y * run.progress + perp.y * run.lateral,
    dir
  }
}

function projectOntoSegment(world: TrackPoint, segment: number) {
  const start = track.value[segment] || track.value[0] || { x: 0, y: 0 }
  const dir = segmentDirection(segment)
  const perp = { x: -dir.y, y: dir.x }
  return {
    progress: (world.x - start.x) * dir.x + (world.y - start.y) * dir.y,
    lateral: (world.x - start.x) * perp.x + (world.y - start.y) * perp.y
  }
}

function worldToScreen(point: TrackPoint, center: TrackPoint, width: number, height: number) {
  const dx = point.x - center.x
  const dy = point.y - center.y
  return { x: width / 2 + (dx - dy) * 42, y: height * 0.54 + (dx + dy) * 24 }
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string, stroke = '#293340') {
  ctx.beginPath()
  ctx.moveTo(x, y - radius * 0.58)
  ctx.lineTo(x + radius, y)
  ctx.lineTo(x, y + radius * 0.58)
  ctx.lineTo(x - radius, y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2
  ctx.stroke()
}

function draw() {
  const element = canvas.value
  const context = element?.getContext('2d')
  if (!element || !context) return
  const scale = window.devicePixelRatio || 1
  const rect = element.getBoundingClientRect()
  if (element.width !== Math.floor(rect.width * scale) || element.height !== Math.floor(rect.height * scale)) {
    element.width = Math.floor(rect.width * scale)
    element.height = Math.floor(rect.height * scale)
  }
  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.clearRect(0, 0, rect.width, rect.height)
  const gradient = context.createLinearGradient(0, 0, rect.width, rect.height)
  gradient.addColorStop(0, '#0d1820')
  gradient.addColorStop(0.52, '#24313a')
  gradient.addColorStop(1, '#4d4036')
  context.fillStyle = gradient
  context.fillRect(0, 0, rect.width, rect.height)
  const car = carPosition()
  const visibleStart = Math.max(0, run.segment - 10)
  const visibleEnd = Math.min(track.value.length - 1, run.segment + 38)
  for (let index = visibleEnd; index >= visibleStart; index--) {
    const point = track.value[index]
    if (!point) continue
    const screen = worldToScreen(point, car, rect.width, rect.height)
    drawDiamond(context, screen.x, screen.y, 45, index % 5 === 0 ? '#52616b' : '#647480')
    if (index > run.segment && index % 3 === 1 && !coins.value.has(index)) {
      context.beginPath()
      context.arc(screen.x, screen.y - 6, 7, 0, Math.PI * 2)
      context.fillStyle = '#f6c85f'
      context.fill()
      context.strokeStyle = '#fff2b3'
      context.lineWidth = 2
      context.stroke()
    }
  }
  for (const racer of sortedRacers.value) {
    if (racer.userId === auth.value.user?.id || racer.status !== 'racing') continue
    const offset = Math.max(-8, Math.min(24, (racer.distance - run.distance) / 64))
    const marker = worldToScreen({ x: car.x, y: car.y - offset }, car, rect.width, rect.height)
    context.fillStyle = '#f0785f'
    context.beginPath()
    context.arc(marker.x + 32, marker.y - 26, 8, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#fff'
    context.font = '700 10px DM Sans, sans-serif'
    context.fillText(racer.name.slice(0, 10), marker.x + 44, marker.y - 22)
  }
  context.save()
  context.translate(rect.width / 2, rect.height * 0.54)
  const angle = Math.atan2(car.dir.y, car.dir.x) + Math.PI / 2
  context.rotate(angle)
  context.fillStyle = run.ghostTime > 0 ? '#d3f5ff' : run.shield > 0 ? '#9bd4ff' : '#f5f1e8'
  context.strokeStyle = '#1b252c'
  context.lineWidth = 3
  context.beginPath()
  context.moveTo(0, -22)
  context.lineTo(15, 19)
  context.lineTo(0, 12)
  context.lineTo(-15, 19)
  context.closePath()
  context.fill()
  context.stroke()
  context.restore()
}

function finish(crashed: boolean) {
  if (run.status !== 'running') return
  run.status = crashed ? 'crashed' : 'finished'
  run.message = crashed ? 'Crashed' : 'Finished'
  cancelAnimationFrame(frame)
  void api('/api/game/race', {
    method: 'POST',
    body: {
      action: 'finish',
      runId: run.runId,
      distance: Math.floor(run.distance),
      score: Math.floor(run.score),
      coins: run.coins,
      combo: run.bestCombo,
      crashed,
      boosters: usedBoosters.value
    }
  }).then(() => refresh()).catch((error: any) => { failure.value = error?.data?.statusMessage || 'Could not save the race.' })
}

function crashOrShield() {
  if (run.ghostTime > 0) return
  if (run.shield > 0) {
    run.shield--
    run.lateral = 0
    run.message = 'Saved'
    return
  }
  finish(true)
}

function step(now: number) {
  if (run.status !== 'running') return
  const dt = Math.min(0.034, Math.max(0.001, (now - lastFrame) / 1000 || 0.016))
  lastFrame = now
  const upgrades = profile.value.upgrades
  const levelFactor = 1 + selectedLevel.value * 0.012
  const overdrive = usedBoosters.value.overdrive ? 0.28 : 0
  const speed = (1.22 + upgrades.turbo * 0.055 + overdrive) * levelFactor
  const steering = pressed.value ? 1 : -1
  const grip = upgrades.grip * 0.012
  run.lateral += steering * (0.58 - grip) * dt
  run.progress += speed * dt
  run.distance += speed * 32 * dt
  run.score += speed * (9 + selectedLevel.value * 0.45) * dt * (1 + run.combo * 0.006)
  if (run.ghostTime > 0) run.ghostTime = Math.max(0, run.ghostTime - dt)
  while (run.progress >= 1 && run.status === 'running') {
    const world = carPosition()
    run.segment = Math.min(run.segment + 1, track.value.length - 2)
    const projected = projectOntoSegment(world, run.segment)
    run.progress = Math.max(0, projected.progress - 1)
    run.lateral = projected.lateral
  }
  const roadLimit = 0.44 + upgrades.grip * 0.018
  if (Math.abs(run.lateral) > roadLimit) crashOrShield()
  const coinIndex = run.segment + 1
  const magnetRadius = usedBoosters.value.magnet ? 0.55 + upgrades.magnet * 0.04 : 0.22 + upgrades.magnet * 0.02
  if (coinIndex % 3 === 1 && !coins.value.has(coinIndex) && Math.abs(run.lateral) <= magnetRadius) {
    coins.value = new Set([...coins.value, coinIndex])
    run.coins += 1 + Math.floor(selectedLevel.value / 10)
    run.combo++
    run.bestCombo = Math.max(run.bestCombo, run.combo)
  } else if (Math.abs(run.lateral) > roadLimit * 0.75) {
    run.combo = 0
  }
  if (run.segment >= track.value.length - 4) finish(false)
  if (now - lastProgressPost > 1200) {
    lastProgressPost = now
    void api('/api/game/race', { method: 'POST', body: { action: 'progress', runId: run.runId, distance: Math.floor(run.distance), score: Math.floor(run.score) } }).catch(() => {})
  }
  draw()
  frame = requestAnimationFrame(step)
}

async function startRace() {
  if (!canStart.value) return
  failure.value = ''
  feedback.value = ''
  const selected = selectedBoosters.value.filter(id => profile.value.boosters[id] > 0 && (data.value.boosters.find(item => item.id === id)?.unlockLevel || 1) <= profile.value.level)
  usedBoosters.value = {
    shield: selected.includes('shield') ? 1 : 0,
    magnet: selected.includes('magnet') ? 1 : 0,
    overdrive: selected.includes('overdrive') ? 1 : 0,
    ghost: selected.includes('ghost') ? 1 : 0
  }
  const started = await api<{ runId: string; seed: string }>('/api/game/race', { method: 'POST', body: { action: 'start' } })
  track.value = generateTrack(started.seed)
  coins.value = new Set()
  Object.assign(run, {
    status: 'running',
    runId: started.runId,
    segment: 0,
    progress: 0,
    lateral: 0,
    distance: 0,
    score: 0,
    coins: 0,
    combo: 0,
    bestCombo: 0,
    shield: usedBoosters.value.shield ? 1 + Math.floor(profile.value.upgrades.shield / 3) : 0,
    ghostTime: usedBoosters.value.ghost ? 5 + profile.value.upgrades.shield * 0.8 : 0,
    startedAt: performance.now(),
    message: 'Racing'
  })
  lastFrame = performance.now()
  lastProgressPost = lastFrame
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(step)
  await nextTick(draw)
}

function toggleBooster(id: GameBoosterId) {
  if (run.status === 'running') return
  selectedBoosters.value = selectedBoosters.value.includes(id)
    ? selectedBoosters.value.filter(item => item !== id)
    : [...selectedBoosters.value, id]
}

async function buy(type: 'booster' | 'upgrade', id: GameBoosterId | GameUpgradeId) {
  busyShop.value = `${type}:${id}`
  failure.value = ''
  feedback.value = ''
  try {
    await api('/api/game/shop', { method: 'POST', body: { type, id } })
    feedback.value = type === 'booster' ? 'Booster added.' : 'Upgrade installed.'
    await refresh()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not buy that.' }
  finally { busyShop.value = '' }
}

async function claimCode() {
  if (claiming.value || !promoCode.value.trim()) return
  claiming.value = true
  failure.value = ''
  feedback.value = ''
  try {
    await api('/api/game/code', { method: 'POST', body: { code: promoCode.value.trim() } })
    promoCode.value = ''
    feedback.value = 'Highest level unlocked.'
    await refresh()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Code failed.' }
  finally { claiming.value = false }
}

function upgradePrice(id: GameUpgradeId) {
  const upgrade = data.value.upgrades.find(item => item.id === id)
  const level = profile.value.upgrades[id]
  return upgrade ? Math.round(upgrade.baseCost * Math.pow(1.55, level)) : 0
}

function onKey(event: KeyboardEvent, value: boolean) {
  if (event.code === 'Space' || event.code === 'ArrowRight') {
    event.preventDefault()
    pressed.value = value
  }
}

onMounted(() => {
  track.value = generateTrack(data.value.seed || 'sq-drift')
  draw()
  window.addEventListener('keydown', keyDown)
  window.addEventListener('keyup', keyUp)
  window.addEventListener('resize', draw)
  refreshTimer = setInterval(() => { void refresh().then(draw).catch(() => {}) }, 2500)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('keydown', keyDown)
  window.removeEventListener('keyup', keyUp)
  window.removeEventListener('resize', draw)
  if (refreshTimer) clearInterval(refreshTimer)
})

useHead({ title: 'SQ Drift / SQ Chat' })
</script>

<template>
  <div class="site-shell game-page">
    <header class="topbar"><BrandLogo /><span class="topbar-caption">SQ Drift</span><nav class="topbar-actions"><NuxtLink to="/" class="topbar-link"><UiIcon name="arrow-left" /> Chat</NuxtLink><NuxtLink to="/account" class="topbar-link"><UiIcon name="user" /> {{ auth.user?.name }}</NuxtLink></nav></header>
    <main v-if="error" class="game-denied"><span><UiIcon name="lock" /></span><h1>Game access is locked.</h1><p>{{ (error as any)?.data?.statusMessage || 'Andrew approves game access from Manage.' }}</p><NuxtLink to="/" class="primary-button">Back to chat <UiIcon name="arrow-right" /></NuxtLink></main>
    <main v-else class="game-layout">
      <section class="game-stage" @pointerdown="pressed = true" @pointerup="pressed = false" @pointercancel="pressed = false" @pointerleave="pressed = false">
        <div class="game-hud">
          <div><strong>{{ Math.floor(run.distance) }}m</strong><span>Distance</span></div>
          <div><strong>{{ Math.floor(run.score) }}</strong><span>Score</span></div>
          <div><strong>{{ run.coins }}</strong><span>Coins</span></div>
          <div><strong>{{ run.bestCombo }}x</strong><span>Combo</span></div>
        </div>
        <canvas ref="canvas" class="drift-canvas" aria-label="SQ Drift race track"></canvas>
        <div class="race-controls">
          <button class="primary-button race-start" :disabled="!canStart" @click="startRace"><UiIcon :name="run.status === 'running' ? 'zap' : 'play'" /> {{ run.status === 'running' ? 'Racing' : 'Start race' }}</button>
          <button v-if="run.status === 'running'" class="restore-button" @click="finish(false)">Finish</button>
          <span class="race-status">{{ run.message }}</span>
        </div>
      </section>
      <aside class="game-sidebar">
        <section class="game-panel player-panel">
          <div class="game-panel-title"><span><UiIcon name="trophy" /></span><div><h1>Level {{ profile.level }}</h1><p>{{ profile.coins }} coins / best {{ profile.bestDistance }}m</p></div></div>
          <div class="level-meter"><span :style="{ width: levelProgress + '%' }"></span></div>
          <label class="game-select">Race level<select v-model.number="selectedLevel" :disabled="run.status === 'running'"><option v-for="level in levelOptions" :key="level" :value="level">Level {{ level }}</option></select></label>
        </section>

        <section class="game-panel">
          <div class="section-heading"><span>Boosters</span><span class="section-hint">{{ selectedBoosters.length }} armed</span></div>
          <div class="booster-grid">
            <button v-for="booster in data.boosters" :key="booster.id" class="booster-button" :class="{ active: selectedBoosters.includes(booster.id) }" :disabled="run.status === 'running' || profile.level < booster.unlockLevel || profile.boosters[booster.id] < 1" @click="toggleBooster(booster.id)">
              <strong>{{ booster.name }}</strong><span>{{ profile.level < booster.unlockLevel ? `Level ${booster.unlockLevel}` : `${profile.boosters[booster.id]} owned` }}</span>
            </button>
          </div>
        </section>

        <section class="game-panel">
          <div class="section-heading"><span>Live race</span><span class="section-hint">Same track</span></div>
          <div class="racer-list"><article v-for="racer in sortedRacers" :key="racer.userId" class="racer-row"><div><strong>{{ racer.name }}</strong><span>{{ racer.status }}</span></div><meter min="0" :max="bestLiveDistance" :value="racer.distance"></meter><small>{{ racer.distance }}m</small></article><p v-if="!sortedRacers.length" class="field-help">No active racers yet.</p></div>
        </section>

        <section class="game-panel">
          <div class="section-heading"><span>Shop</span><span class="section-hint">{{ profile.coins }} coins</span></div>
          <div class="shop-list">
            <article v-for="upgrade in data.upgrades" :key="upgrade.id" class="shop-row"><div><strong>{{ upgrade.name }}</strong><span>{{ profile.upgrades[upgrade.id] }}/{{ upgrade.maxLevel }}</span></div><button class="small-primary" :disabled="busyShop === `upgrade:${upgrade.id}` || profile.upgrades[upgrade.id] >= upgrade.maxLevel || profile.coins < upgradePrice(upgrade.id)" @click="buy('upgrade', upgrade.id)">{{ profile.upgrades[upgrade.id] >= upgrade.maxLevel ? 'Max' : upgradePrice(upgrade.id) }}</button></article>
            <article v-for="booster in data.boosters" :key="booster.id" class="shop-row"><div><strong>{{ booster.name }}</strong><span>{{ profile.level < booster.unlockLevel ? `Unlocks level ${booster.unlockLevel}` : booster.description }}</span></div><button class="small-primary" :disabled="busyShop === `booster:${booster.id}` || profile.level < booster.unlockLevel || profile.coins < booster.cost" @click="buy('booster', booster.id)">{{ booster.cost }}</button></article>
          </div>
        </section>

        <section class="game-panel">
          <form class="promo-form" @submit.prevent="claimCode"><label>Upgrade code<input v-model="promoCode" :disabled="profile.promoCodeUsed || claiming" maxlength="40" placeholder="Code"></label><button class="primary-button" :disabled="profile.promoCodeUsed || claiming || !promoCode.trim()">Apply <UiIcon name="arrow-right" /></button></form>
          <p v-if="profile.promoCodeUsed" class="settings-feedback-success">Highest level active.</p>
          <p v-if="feedback" class="settings-feedback-success">{{ feedback }}</p>
          <p v-if="failure" class="form-error">{{ failure }}</p>
        </section>

        <section class="game-panel">
          <div class="section-heading"><span>Leaderboard</span><span class="section-hint">Best distance</span></div>
          <ol class="leaderboard"><li v-for="entry in data.leaderboard" :key="entry.userId"><span>{{ entry.name }}</span><strong>{{ entry.bestDistance }}m</strong></li></ol>
        </section>
      </aside>
    </main>
  </div>
</template>
