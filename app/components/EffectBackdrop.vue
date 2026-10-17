<script setup lang="ts">
import type { ScreenEffect } from '#shared/types/media'
const props = defineProps<{ effect?: ScreenEffect; text?: string; sound?: boolean; play: number }>()
const active = ref(false)
const reduced = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let media: MediaQueryList | undefined
let audioContext: AudioContext | undefined
const particles = Array.from({ length: 36 }, (_, i) => ({ left: `${(i * 37 + 13) % 100}%`, delay: `${(i % 12) * .11}s`, hue: `${(i * 47) % 360}`, tilt: `${(i * 29) % 90 - 45}deg`, burstX: `${Math.cos(i / 36 * Math.PI * 2) * (80 + i % 4 * 30)}px`, burstY: `${Math.sin(i / 36 * Math.PI * 2) * (80 + i % 4 * 30)}px` }))
function playSound() {
  if (!props.sound || !['fireworks','celebration'].includes(props.effect || '')) return
  try {
    audioContext ||= new AudioContext()
    if (audioContext.state !== 'running') return
    for (let i = 0; i < 5; i++) {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain()
      oscillator.type = 'sine'; oscillator.frequency.value = props.effect === 'celebration' ? 523.25 * (1 + i / 4) : 130 + i * 85
      const start = audioContext.currentTime + i * .18
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.035, start + .025); gain.gain.exponentialRampToValueAtTime(.001, start + .5)
      oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(start); oscillator.stop(start + .55)
    }
  } catch { /* Audio remains optional when a browser blocks it. */ }
}
async function enableSound() {
  if (!props.sound) return
  try { audioContext ||= new AudioContext(); await audioContext.resume() } catch {}
}
function dismiss() { active.value = false; clearTimeout(timer) }
function escape(event: KeyboardEvent) { if (event.key === 'Escape') dismiss() }
function launch() {
  clearTimeout(timer); active.value = false
  if (!props.effect || reduced.value) return
  nextTick(() => { active.value = true; playSound(); timer = setTimeout(() => { active.value = false }, 5000) })
}
watch(() => props.play, launch)
watch(() => props.sound, enableSound)
watch(() => props.effect, effect => { if (!effect) active.value = false })
onMounted(() => { window.addEventListener('keydown', escape); media = matchMedia('(prefers-reduced-motion: reduce)'); reduced.value = media.matches; media.addEventListener('change', updateMotion); if (props.sound) void enableSound() })
function updateMotion(event: MediaQueryListEvent) { reduced.value = event.matches; if (event.matches) active.value = false }
onBeforeUnmount(() => { window.removeEventListener('keydown', escape); clearTimeout(timer); media?.removeEventListener('change', updateMotion); void audioContext?.close() })
</script>
<template>
  <Teleport to="body"><div v-if="active && effect" :key="play" class="screen-effect" :class="`screen-${effect}`" aria-hidden="true"><div class="screen-effect-stage"><template v-if="effect === 'echo'"><span v-for="(particle, index) in particles.slice(0, 16)" :key="index" class="echo-copy" :style="{ left: particle.left, top: `${(index * 29) % 85}%`, '--delay': particle.delay, '--tilt': particle.tilt }">{{ (text || 'Something to share').slice(0, 100) }}</span></template><template v-else-if="effect === 'spotlight'"><div class="spotlight-beam"></div><div class="spotlight-message">{{ (text || 'Something to share').slice(0, 180) }}</div></template><svg v-else-if="effect === 'love'" class="love-heart" viewBox="0 0 100 100"><defs><radialGradient id="sq-heart-light" cx="30%" cy="20%"><stop offset="0" stop-color="#ffb3c6"/><stop offset=".6" stop-color="#eb477b"/><stop offset="1" stop-color="#ad1f50"/></radialGradient></defs><path d="M50 88 14 51C-7 28 19 2 39 18L50 28 61 18C81 2 107 28 86 51Z" fill="url(#sq-heart-light)"/></svg><template v-else><span v-for="(particle, index) in particles" :key="index" class="screen-particle" :style="{ '--left': particle.left, '--delay': particle.delay, '--hue': particle.hue, '--tilt': particle.tilt, '--burst-x': particle.burstX, '--burst-y': particle.burstY, '--angle': `${index * 10}deg` }"></span></template></div></div><button v-if="active" class="dismiss-effect" type="button" @click="dismiss"><UiIcon name="close" /> Dismiss effect</button></Teleport>
</template>
