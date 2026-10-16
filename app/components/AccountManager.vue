<script setup lang="ts">
import type { Account } from '#shared/types/auth'
const { api } = useAuth()
const { data: accounts, refresh } = await useAsyncData('accounts', () => api<Account[]>('/api/admin/accounts'), { default: () => [] })
const visible = computed(() => accounts.value.filter(account => account.status !== 'disabled'))
const removed = computed(() => accounts.value.filter(account => account.status === 'disabled'))
const busy = ref(false)
const failure = ref('')
const status = ref('')
const invitation = ref<{ code: string; name: string } | null>(null)
const confirmation = ref<{ id: string; action: string; name: string } | null>(null)
const resetConfirm = ref(false)
const newName = ref('')
useChatEvents(() => { void refresh() })
function ask(account: Account, action: string) {
  confirmation.value = { id: account.id, name: account.name, action }; resetConfirm.value = false
}
async function act(id: string, action: string) {
  if (busy.value) return
  busy.value = true; failure.value = ''; status.value = ''; invitation.value = null
  try {
    const result = await api('/api/admin/accounts', { method: 'POST', body: { id, action } })
    confirmation.value = null
    if (result.code) invitation.value = { code: result.code, name: result.name }
    else status.value = action === 'allow-password' ? 'One password change allowed for the next 24 hours.' : 'Account updated.'
    await refresh()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not update this account.' }
  finally { busy.value = false }
}
async function add() {
  if (busy.value || !newName.value.trim()) return
  busy.value = true; failure.value = ''; status.value = ''
  try {
    await api('/api/auth/request', { method: 'POST', body: { name: newName.value } })
    status.value = 'Name requested. Approve the account below, or check whether it already exists.'; newName.value = ''
    await refresh()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not add this name.' }
  finally { busy.value = false }
}
async function reset() {
  if (busy.value) return
  busy.value = true; failure.value = ''; invitation.value = null
  try {
    await api('/api/admin/reset-people', { method: 'POST', body: {} })
    resetConfirm.value = false; status.value = 'Only Andrew, Darius and Harrison remain. Their passwords are unchanged. Messages are preserved.'
    await refresh()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not reset the names.' }
  finally { busy.value = false }
}
async function copy() {
  try { await navigator.clipboard.writeText(invitation.value!.code); status.value = 'Setup code copied.' }
  catch { status.value = 'Select the code and copy it manually.' }
}
</script>
<template>
  <section class="manage-card people-card"><div class="card-title"><span class="card-icon"><UiIcon name="users" /></span><div><h2>Accounts <span class="message-count">{{ visible.length }}</span></h2><p>You approve who joins and who may change a password.</p></div></div>
    <p class="people-card-note">Confirm who owns each name before sharing a setup code. The original three accounts cannot be deleted.</p>
    <form class="add-name-form admin-add-name" @submit.prevent="add"><label for="admin-new-name">Add a name</label><div class="add-name-row"><input id="admin-new-name" v-model="newName" maxlength="24" placeholder="New member’s name" required><button :disabled="busy || !newName.trim()" aria-label="Add name"><UiIcon name="plus" /></button></div></form>
    <div v-if="invitation" class="invite-card" role="status"><strong>Setup code for {{ invitation.name }}</strong><p>Share this privately with {{ invitation.name }}. They choose “Set password” on the sign-in page. This code works once and expires in 24 hours.</p><input :value="invitation.code" readonly aria-label="One-use setup code" @focus="($event.target as HTMLInputElement).select()"><div class="message-actions"><button class="small-primary" @click="copy"><UiIcon name="copy" /> Copy code</button><button class="plain-button" @click="invitation = null">Dismiss</button></div></div>
    <p v-if="status" class="settings-feedback-success" role="status">{{ status }}</p><p v-if="failure" class="form-error" role="alert">{{ failure }}</p>
    <div class="account-list"><article v-for="account in visible" :key="account.id" class="account-row"><div class="person-manager-main"><span class="avatar" :class="personTone(account.name)">{{ personInitial(account.name) }}</span><div><strong>{{ account.name }}</strong><p class="account-status">{{ account.role === 'admin' ? 'Administrator' : account.status === 'pending' ? 'Awaiting your approval' : account.status === 'approved' ? 'Approved · awaiting password' : 'Active' }}<span v-if="account.builtin"> · Original</span></p></div></div>
      <div v-if="account.role !== 'admin'" class="message-actions account-controls">
        <button v-if="account.status !== 'active'" class="small-primary" :disabled="busy" @click="act(account.id, 'approve')">{{ account.status === 'approved' ? 'New setup code' : 'Approve & get code' }}</button>
        <template v-else><button class="plain-button" :disabled="busy" @click="act(account.id, account.canChangePassword ? 'cancel-password' : 'allow-password')">{{ account.canChangePassword ? 'Cancel password permission' : 'Allow password change' }}</button><button class="plain-button" :disabled="busy" @click="ask(account, 'reset')">Reset password</button><button class="plain-button" :disabled="busy" @click="ask(account, 'revoke')">Sign out devices</button></template>
        <button v-if="!account.builtin" class="plain-button danger-button" :disabled="busy" @click="ask(account, 'delete')"><UiIcon name="trash" /> Remove</button>
      </div>
      <div v-if="confirmation?.id === account.id" class="restore-confirmation"><p>{{ confirmation.action === 'delete' ? `Remove ${account.name} and revoke their access? Messages remain.` : confirmation.action === 'reset' ? `Reset ${account.name}’s password? Their old password and sessions will stop working. Share the new setup code privately.` : `Sign ${account.name} out of every device? They can sign in again with their password.` }}</p><div class="message-actions"><button class="restore-confirm-button" :disabled="busy" @click="act(confirmation.id, confirmation.action)">Confirm</button><button class="plain-button" @click="confirmation = null">Cancel</button></div></div>
    </article></div>
    <details v-if="removed.length" class="removed-accounts"><summary>Removed accounts ({{ removed.length }})</summary><div v-for="account in removed" :key="account.id" class="removed-account"><span>{{ account.name }}</span><button class="plain-button" :disabled="busy" @click="act(account.id, 'approve')">Approve again</button></div></details>
    <button class="restore-button names-reset-button" :disabled="busy || !visible.some(account => !account.builtin)" @click="resetConfirm = !resetConfirm; confirmation = null"><UiIcon name="rotate" /> Reset names to defaults</button>
    <div v-if="resetConfirm" class="restore-confirmation"><strong>Keep only the original three accounts?</strong><p>All added accounts lose access immediately. Messages remain. Andrew, Darius and Harrison keep their current passwords and approval status.</p><div class="message-actions"><button class="restore-confirm-button" :disabled="busy" @click="reset">Yes, reset names</button><button class="plain-button" @click="resetConfirm = false">Cancel</button></div></div>
  </section>
</template>
