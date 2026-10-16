<script setup lang="ts">
type IconName = 'arrow-up-right' | 'arrow-left' | 'arrow-up' | 'arrow-right' | 'check' | 'plus' | 'rotate' | 'trash' | 'lock'
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
  lock: ['M5 10h14v11H5z', 'M8 10V7a4 4 0 0 1 8 0v3']
}
</script>

<template>
  <svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-for="path in paths[name]" :key="path" :d="path" />
  </svg>
</template>
