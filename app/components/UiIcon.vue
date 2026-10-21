<script setup lang="ts">
type IconName = 'bell' | 'arrow-up-right' | 'arrow-left' | 'arrow-up' | 'arrow-right' | 'check' | 'plus' | 'rotate' | 'trash' | 'lock' | 'shield' | 'users' | 'user' | 'settings' | 'copy' | 'paperclip' | 'file' | 'image' | 'download' | 'share' | 'close' | 'eye' | 'sound' | 'muted' | 'play' | 'reply' | 'edit' | 'mic' | 'stop'
defineProps<{ name: IconName }>()

const paths: Record<IconName, string[]> = {
  'arrow-up-right': ['M7 17 17 7', 'M8 7h9v9'],
  'arrow-left': ['M19 12H5', 'm12 5-7 7 7 7'],
  'arrow-up': ['M12 19V5', 'm5 12 7-7 7 7'],
  'arrow-right': ['M5 12h14', 'm12 5 7 7-7 7'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  check: ['m5 12 4 4L19 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  rotate: ['M3 11a9 9 0 1 1 2.6 6.4', 'M3 4v7h7'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  lock: ['M5 10h14v11H5z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  shield: ['M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z', 'm8 12 3 3 5-6'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M18 4a4 4 0 0 1 0 7', 'M22 21v-2a4 4 0 0 0-3-3.9'],
  user: ['M20 21v-2a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v2', 'M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
  settings: ['M4 7h16', 'M4 17h16', 'M8 4v6', 'M16 14v6'],
  copy: ['M8 8h12v13H8z', 'M16 8V3H3v13h5'],
  reply: ['M9 10V5l-7 7 7 7v-5h5c4 0 7 2 8 5v-4c0-5-4-8-9-8H9'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
  paperclip: ['m8 12 7-7a4 4 0 0 1 6 6L10 22a6 6 0 0 1-8-8L13 3', 'm7 15 8-8a1.5 1.5 0 0 1 2 2l-8 8'],
  file: ['M14 2H5v20h14V7z', 'M14 2v5h5', 'M8 12h8', 'M8 16h6'],
  image: ['M3 3h18v18H3z', 'm3 16 5-5 5 5 3-3 5 5', 'M16 7h.01'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 16v5h16v-5'],
  share: ['M12 16V3', 'm7 8 5-5 5 5', 'M5 12H3v9h18v-9h-2'],
  close: ['m6 6 12 12', 'm6 18 12-12'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  sound: ['M3 9h4l5-5v16l-5-5H3z', 'M16 8a6 6 0 0 1 0 8', 'M19 5a10 10 0 0 1 0 14'],
  muted: ['M3 9h4l5-5v16l-5-5H3z', 'm17 9 5 6', 'm17 15 5-6'],
  play: ['m8 4 12 8-12 8z'],
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3', 'M8 22h8'],
  stop: ['M6 6h12v12H6z']
}
</script>

<template>
  <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-for="path in paths[name]" :key="path" :d="path" />
  </svg>
</template>
