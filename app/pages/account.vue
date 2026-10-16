<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
const { auth, api, load, logout } = useAuth()
const currentPassword = ref('')
const password = ref('')
const confirmation = ref('')
const busy = ref(false)
const failure = ref('')
const confirmLogout = ref(false)
useChatEvents(() => { void load() })
async function changePassword() {
  if (busy.value) return
  failure.value = ''
  if (password.value !== confirmation.value) { failure.value = 'Your passwords do not match.'; return }
  busy.value = true
  try {
    await api('/api/auth/password', { method: 'POST', body: { currentPassword: currentPassword.value, password: password.value } })
    currentPassword.value = ''; password.value = ''; confirmation.value = ''
    auth.value = { user: null, csrf: '' }; clearNuxtData()
    await navigateTo('/login')
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not change your password.' }
  finally { busy.value = false }
}
async function signOut(all = false) {
  busy.value = true
  try { await logout(all) } catch { failure.value = 'Could not sign out. Please try again.'; busy.value = false }
}
useHead({ title: 'My account · SQ Chat' })
</script>
<template>
  <div class="site-shell">
    <header class="topbar"><BrandLogo /><span class="topbar-caption">My account</span><NuxtLink to="/" class="topbar-link"><UiIcon name="arrow-left" /> Back to chat</NuxtLink></header>
    <main class="account-main"><div class="account-heading"><span class="avatar" :class="personTone(auth.user?.name || '')">{{ personInitial(auth.user?.name || '') }}</span><div><h1>{{ auth.user?.name }}</h1><p>{{ auth.user?.role === 'admin' ? 'Room administrator' : 'Member' }}</p></div></div>
      <section class="manage-card"><div class="card-title"><span class="card-icon"><UiIcon name="lock" /></span><div><h2>Password</h2><p>{{ auth.user?.canChangePassword ? 'Choose a unique password that you keep to yourself.' : 'Andrew needs to approve a password change first.' }}</p></div></div>
        <form v-if="auth.user?.canChangePassword" class="settings-form" @submit.prevent="changePassword"><label>Current password<input v-model="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label><label>New password<input v-model="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Confirm new password<input v-model="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><p class="field-help">Use 12–128 characters. Saving signs out every device, including this one. {{ auth.user?.role === 'member' ? 'Andrew’s approval can be used once and expires after 24 hours.' : '' }}</p><button class="primary-button" type="submit" :disabled="busy">Save password <UiIcon name="arrow-right" /></button></form>
        <p v-else class="field-help">Ask Andrew to select “Allow password change” for your account. This form will unlock here automatically.</p>
        <p v-if="failure" class="form-error" role="alert">{{ failure }}</p>
      </section>
      <section class="manage-card"><div class="card-title"><span class="card-icon"><UiIcon name="shield" /></span><div><h2>Your sessions</h2><p>Sign-ins expire after 12 hours, or 30 minutes without activity.</p></div></div><div class="account-actions"><button class="restore-button" :disabled="busy" @click="signOut()">Sign out here</button><button class="plain-button danger-button" :disabled="busy" @click="confirmLogout = !confirmLogout">Sign out all devices</button></div><div v-if="confirmLogout" class="restore-confirmation"><p>End every sign-in for your account? You can sign in again with your password.</p><button class="restore-confirm-button" :disabled="busy" @click="signOut(true)">Yes, sign out everywhere</button></div></section>
    </main>
  </div>
</template>
