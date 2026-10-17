<script setup lang="ts">
import type { NuxtError } from '#app'
const props = defineProps<{ error: NuxtError }>()
const { recovery, unsent, retry } = useAppRecovery()
const copied = ref(false)
const loadFailure = computed(() => recovery.value.failed || /dynamically imported module|module script failed|Loading .*chunk|preload CSS/i.test(props.error.message || ''))
async function copyDraft() {
  try { await navigator.clipboard.writeText(unsent.value.text); copied.value = true } catch { copied.value = false }
}
useHead({ title: 'Reconnect · SQ Chat' })
</script>

<template>
  <main class="recovery-page">
    <section class="recovery-card" aria-labelledby="recovery-heading">
      <p class="recovery-brand">SQ <span>CHAT</span></p>
      <h1 id="recovery-heading">{{ loadFailure ? 'Let’s reconnect.' : error.statusCode === 404 ? 'Page not found.' : 'Something interrupted SQ Chat.' }}</h1>
      <p>{{ loadFailure ? 'Part of the app could not download. Check your connection and try again.' : 'Your saved conversations are still there. Try opening the chat again.' }}</p>
      <div v-if="unsent.text || unsent.files" class="recovery-draft">
        <label v-if="unsent.text" for="saved-draft">Copy your unsent message before reloading.</label>
        <textarea v-if="unsent.text" id="saved-draft" :value="unsent.text" readonly rows="5"></textarea>
        <button v-if="unsent.text" class="plain-button" type="button" @click="copyDraft">{{ copied ? 'Copied' : 'Copy message' }}</button>
        <p v-if="unsent.files">You will need to attach your unsent files again.</p>
      </div>
      <button class="primary-button" type="button" :disabled="recovery.reloading" @click="retry">{{ recovery.reloading ? 'Reconnecting…' : 'Try again' }}</button>
      <a class="recovery-home" href="/">Open chat</a>
    </section>
  </main>
</template>

<style scoped>
.recovery-page{min-height:100dvh;display:grid;place-items:center;padding:24px;background:#f7f6f2;color:#293a2b;font-family:Arial,sans-serif;box-sizing:border-box}.recovery-card{width:100%;max-width:460px;padding:32px;border:1px solid #e1e5da;border-radius:20px;background:#fff;box-sizing:border-box}.recovery-brand{font-size:28px;font-weight:700;letter-spacing:-2px}.recovery-brand span{font-size:11px;letter-spacing:3px;margin-left:8px}.recovery-card h1{font-size:28px;letter-spacing:-1px;margin:28px 0 14px}.recovery-card p,.recovery-draft label{font-size:14px;line-height:1.7;color:#667060}.recovery-card .primary-button{margin-top:20px}.recovery-home{display:inline-block;margin:20px 0 0 18px;color:#486948;font-size:13px}.recovery-draft{margin-top:24px}.recovery-draft textarea{box-sizing:border-box;width:100%;margin:10px 0;padding:12px;border:1px solid #d9dfd1;border-radius:8px;resize:vertical;font:14px/1.6 inherit;color:inherit;background:#fafbf8}
</style>
