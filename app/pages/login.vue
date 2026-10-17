<script setup lang="ts">
import type { AuthState } from '#shared/types/auth'
const { auth, api, load } = useAuth()
const { autoEnable } = useDeviceNotifications()
if (await load()) await navigateTo(auth.value.user?.homeConversation ? { path: '/', query: { chat: auth.value.user.homeConversation } } : '/')
const tab = ref<'login' | 'request' | 'setup'>('login')
const name = ref('')
const password = ref('')
const confirmation = ref('')
const code = ref('')
const busy = ref(false)
const failure = ref('')
const success = ref('')
watch(tab, () => { failure.value = ''; success.value = ''; password.value = ''; confirmation.value = ''; code.value = '' })
async function submit() {
  if (busy.value) return
  busy.value = true; failure.value = ''; success.value = ''
  try {
    if (tab.value === 'login') {
      auth.value = await api<AuthState>('/api/auth/login', { method: 'POST', body: { name: name.value, password: password.value } })
      password.value = ''
      clearNuxtData()
      await autoEnable()
      await navigateTo(auth.value.user?.homeConversation ? { path: '/', query: { chat: auth.value.user.homeConversation } } : '/')
    } else if (tab.value === 'request') {
      const result = await api('/api/auth/request', { method: 'POST', body: { name: name.value } })
      success.value = result.message
    } else {
      if (password.value !== confirmation.value) throw new Error('Your passwords do not match.')
      const result = await api('/api/auth/setup', { method: 'POST', body: { code: code.value, password: password.value } })
      name.value = result.name
      tab.value = 'login'
      await nextTick()
      success.value = 'Password saved. Sign in to join the conversation.'
    }
  } catch (error: any) { failure.value = error?.data?.statusMessage || error.message || 'Please try again.' }
  finally { busy.value = false }
}
useHead({ title: 'Sign in · SQ Chat' })
</script>

<template>
  <div class="site-shell auth-shell">
    <header class="topbar"><BrandLogo /><span class="topbar-caption">Your people. Your space.</span><span class="security-label"><UiIcon name="lock" /> Members only</span></header>
    <main class="auth-layout">
      <section class="auth-intro"><div class="eyebrow"><span class="eyebrow-line"></span> SQ CHAT</div><h1>A little closer,<br>wherever you are.</h1><p>One shared room, private conversations, and a space that feels like yours.</p><div class="auth-people"><span class="avatar andrew">A</span><span class="avatar darius">D</span><span class="avatar harrison">H</span><span>Andrew, Darius, Harrison<br>and your approved people.</span></div></section>
      <section class="manage-card auth-card">
        <div class="auth-tabs" role="group" aria-label="Account access"><button v-for="option in (['login', 'request', 'setup'] as const)" :key="option" type="button" :class="{ active: tab === option }" :aria-pressed="tab === option" @click="tab = option">{{ option === 'login' ? 'Sign in' : option === 'request' ? 'Join' : 'Set password' }}</button></div>
        <h2>{{ tab === 'login' ? 'Welcome back.' : tab === 'request' ? 'Join your people.' : 'Make it yours.' }}</h2>
        <p class="auth-description">{{ tab === 'login' ? 'Sign in with your name and password.' : tab === 'request' ? 'Andrew approves every account before its owner sets a password.' : 'Enter the one-use setup code Andrew shared with you, then choose your own password.' }}</p>
        <form class="settings-form" @submit.prevent="submit">
          <label v-if="tab !== 'setup'">Your name<input v-model="name" maxlength="24" autocomplete="username" placeholder="e.g. Andrew" required :disabled="busy"></label>
          <label v-if="tab === 'setup'">Numeric setup code<input v-model="code" maxlength="43" inputmode="numeric" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" placeholder="Enter the code Andrew shared" required :disabled="busy"></label>
          <label v-if="tab !== 'request'">{{ tab === 'setup' ? 'Choose a password' : 'Password' }}<input v-model="password" type="password" :autocomplete="tab === 'setup' ? 'new-password' : 'current-password'" :minlength="tab === 'setup' ? 12 : 1" maxlength="128" required :disabled="busy"></label>
          <label v-if="tab === 'setup'">Confirm password<input v-model="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required :disabled="busy"></label>
          <p v-if="tab === 'setup'" class="field-help">Use 12–128 characters. A long, unique passphrase works well. Future password changes need Andrew’s approval.</p>
          <p v-if="failure" class="form-error" role="alert">{{ failure }}</p><p v-if="success" class="settings-feedback-success" role="status">{{ success }}</p>
          <button class="primary-button" type="submit" :disabled="busy">{{ busy ? 'Please wait…' : tab === 'login' ? 'Sign in' : tab === 'request' ? 'Request access' : 'Save my password' }}<UiIcon name="arrow-right" /></button>
        </form>
        <p class="auth-footer">{{ tab === 'login' ? 'Forgot your password? Ask Andrew for a reset code, then choose Set password.' : 'Already approved? Andrew will give you a numeric code directly. Codes expire after 24 hours.' }}</p>
      </section>
    </main>
    <p class="privacy-note"><UiIcon name="lock" /> Private chats are visible to their participants and Andrew, the room administrator.</p>
  </div>
</template>
