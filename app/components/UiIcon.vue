<script setup lang="ts">
type IconName = 'arrow-up-right' | 'arrow-left' | 'arrow-up' | 'arrow-right' | 'check' | 'plus' | 'rotate' | 'trash' | 'lock' | 'shield' | 'users' | 'user' | 'settings' | 'copy'
defineProps<{ name: IconName }>()

const paths: Record<IconName, string[]> = {
  'arrow-up-right': ['M7 17 17 7', 'M8 7h9v9'],
  'arrow-left': ['M19 12H5', 'm12 5-7 7 7 7'],
  'arrow-up': ['M12 19V5', 'm5 12 7-7 7 7'],
  'arrow-right': ['M5 12h14', 'm12 5 7 7-7 7'],
  check: ['m5 12 4 4L19 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  rotate: ['M3 11a9 9 0 1 1 2.6 6.4', 'M3 4v7h7'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  lock: ['M5 10h14v11H5z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  shield: ['M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z', 'm8 12 3 3 5-6'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', 'M18 4a4 4 0 0 1 0 7', 'M22 21v-2a4 4 0 0 0-3-3.9'],
  user: ['M20 21v-2a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v2', 'M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
  settings: ['M4 7h16', 'M4 17h16', 'M8 4v6', 'M16 14v6'],
  copy: ['M8 8h12v13H8z', 'M16 8V3H3v13h5']
}
</script>

<template>
  <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-for="path in paths[name]" :key="path" :d="path" />
  </svg>
</template>
