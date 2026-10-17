<script setup lang="ts">
const props = defineProps<{ text: string }>()
const copied = ref(false)
const error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  error.value = ''
  try {
    try { await navigator.clipboard.writeText(props.text) }
    catch {
      const focused = document.activeElement as HTMLElement | null
      const input = document.createElement('textarea')
      input.value = props.text
      input.readOnly = true
      input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
      document.body.append(input)
      try {
        input.select(); input.setSelectionRange(0, input.value.length)
        if (!document.execCommand('copy')) throw new Error('Clipboard unavailable')
      } finally { input.remove(); focused?.focus({ preventScroll: true }) }
    }
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => { copied.value = false }, 2000)
  } catch { error.value = 'Could not copy. Select the message text and copy it.' }
}
onBeforeUnmount(() => clearTimeout(timer))
</script>
<template>
  <div class="message-copy">
    <button type="button" class="plain-button" aria-label="Copy message" @click="copy"><UiIcon :name="copied ? 'check' : 'copy'" /><span aria-live="polite">{{ copied ? 'Copied' : 'Copy' }}</span></button>
    <span v-if="error" role="status" class="copy-error">{{ error }}</span>
  </div>
</template>
<style scoped>
.message-copy{margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.message-copy button{font-size:12px}
.copy-error{font-size:12px;overflow-wrap:anywhere}
</style>
