<script setup lang="ts">
import type { Account } from '#shared/types/auth'
type SetupCode = { id: string; name: string; code: string; createdAt: string; expiresAt: string; status: 'active' | 'used' | 'revoked' }
const { api } = useAuth()
const { data: codeLength, refresh: refreshCodeLength } = await useAsyncData('setup-code-length', () => api<{ length: 'short' | 'long' }>('/api/admin/setup-code-length'), { default: () => ({ length: 'short' as const }) })
const { data: setupCodes, refresh: refreshSetupCodes } = await useAsyncData('setup-codes', () => api<SetupCode[]>('/api/admin/setup-codes'), { default: () => [] })
const { data: accounts, refresh } = await useAsyncData('accounts', () => api<Account[]>('/api/admin/accounts'), { default: () => [] })
const visible = computed(() => accounts.value.filter(account => account.status !== 'disabled'))
const removed = computed(() => accounts.value.filter(account => account.status === 'disabled'))
const busy = ref(false)
const failure = ref('')
const status = ref('')
const invitation = ref<{ code: string; name: string; expiresAt: string } | null>(null)
const copiedCode = ref('')
const deletingCode = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | undefined
const confirmation = ref<{ id: string; action: string; name: string } | null>(null)
const resetConfirm = ref(false)
const newName = ref('')
const savingCodeLength = ref(false)
useChatEvents(() => { void refresh(); void refreshSetupCodes() })
onBeforeUnmount(() => clearTimeout(copiedTimer))
function expiry(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function ask(account: Account, action: string) {
  confirmation.value = { id: account.id, name: account.name, action }; resetConfirm.value = false
}
async function act(id: string, action: string) {
  if (busy.value) return
  busy.value = true; failure.value = ''; status.value = ''; invitation.value = null
  try {
    const result = await api('/api/admin/accounts', { method: 'POST', body: { id, action } })
    confirmation.value = null
    if (result.code) invitation.value = { code: result.code, name: result.name, expiresAt: result.expiresAt }
    else status.value = action === 'allow-shared' ? 'Shared-room access allowed. Existing messages are available.' : action === 'block-shared' ? 'Shared-room access removed. All messages are preserved.' : action === 'allow-cms' ? 'Room editing access granted.' : action === 'block-cms' ? 'Room editing access removed.' : action === 'allow-password' ? 'One password change allowed for the next 24 hours.' : 'Account updated.'
    await refresh()
    await refreshSetupCodes()
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
    await refreshSetupCodes()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not add this name.' }
  finally { busy.value = false }
}
async function reset() {
  if (busy.value) return
  busy.value = true; failure.value = ''; invitation.value = null
  try {
    await api('/api/admin/reset-people', { method: 'POST', body: {} })
    resetConfirm.value = false; status.value = 'Only the default accounts remain. Their passwords are unchanged. Messages are preserved.'
    await refresh()
    await refreshSetupCodes()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not reset the names.' }
  finally { busy.value = false }
}
async function copy(code: string, key: string) {
  try {
    try { await navigator.clipboard.writeText(code) }
    catch {
      const input = document.createElement('textarea')
      input.value = code; input.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
      document.body.append(input)
      try { input.select(); if (!document.execCommand('copy')) throw new Error('Clipboard unavailable') }
      finally { input.remove() }
    }
    copiedCode.value = key
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copiedCode.value = '' }, 2500)
  } catch { failure.value = 'Could not copy. Select the code and copy it manually.' }
}
async function deleteSetupCode(id: string) {
  if (busy.value) return
  busy.value = true; failure.value = ''
  try {
    await api(`/api/admin/setup-codes/${id}`, { method: 'DELETE', body: {} })
    if (invitation.value?.code === setupCodes.value.find(item => item.id === id)?.code) invitation.value = null
    deletingCode.value = ''
    status.value = 'Setup code deleted. It can no longer be used.'
    await refreshSetupCodes()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not delete the setup code.' }
  finally { busy.value = false }
}
async function saveCodeLength(length: 'short' | 'long') {
  if (savingCodeLength.value || codeLength.value.length === length) return
  savingCodeLength.value = true; failure.value = ''; status.value = ''
  try {
    await api('/api/admin/setup-code-length', { method: 'PUT', body: { length } })
    await refreshCodeLength()
    status.value = `New setup codes will be ${length === 'short' ? '6-digit' : '12-digit'} numbers.`
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not change setup code length.' }
  finally { savingCodeLength.value = false }
}
</script>
<template>
  <section class="manage-card people-card"><div class="card-title"><span class="card-icon"><UiIcon name="users" /></span><div><h2>Accounts <span class="message-count">{{ visible.length }}</span></h2><p>You approve who joins and who may change a password.</p></div></div>
    <p class="people-card-note">Confirm who owns each name before sharing a setup code. Default accounts cannot be deleted. You also control shared-room access. Removing access keeps every message.</p>
    <div class="code-length-setting"><div><strong>Setup code length</strong><p>New one-use codes are numeric and expire in 3 days.</p></div><div class="auth-tabs" role="group" aria-label="Setup code length"><button type="button" :class="{ active: codeLength.length === 'short' }" :aria-pressed="codeLength.length === 'short'" :disabled="savingCodeLength" @click="saveCodeLength('short')">Short · 6 digits</button><button type="button" :class="{ active: codeLength.length === 'long' }" :aria-pressed="codeLength.length === 'long'" :disabled="savingCodeLength" @click="saveCodeLength('long')">Long · 12 digits</button></div></div>
    <form class="add-name-form admin-add-name" @submit.prevent="add"><label for="admin-new-name">Add a name</label><div class="add-name-row"><input id="admin-new-name" v-model="newName" maxlength="24" placeholder="New member’s name" required><button :disabled="busy || !newName.trim()" aria-label="Add name"><UiIcon name="plus" /></button></div></form>
    <div v-if="invitation" class="invite-card" role="status"><strong>Setup code for {{ invitation.name }}</strong><p>Share this privately with {{ invitation.name }}. They choose “Set password” on the sign-in page. This code works once and expires {{ expiry(invitation.expiresAt) }}.</p><input :value="invitation.code" readonly aria-label="One-use setup code" @focus="($event.target as HTMLInputElement).select()"><div class="message-actions"><button class="small-primary" @click="copy(invitation.code, invitation.code)"><UiIcon :name="copiedCode === invitation.code ? 'check' : 'copy'" /> {{ copiedCode === invitation.code ? 'Copied' : 'Copy code' }}</button><button class="plain-button" @click="invitation = null">Dismiss</button></div></div>
    <details class="code-store"><summary>Code store ({{ setupCodes.length }})</summary><p class="field-help">Codes stay here for 3 days, including used or replaced codes. Only active codes can set a password. They disappear after expiry, or you can delete them now.</p><p v-if="!setupCodes.length" class="field-help">No saved codes.</p><article v-for="item in setupCodes" :key="item.id" class="stored-code"><div><strong>{{ item.name }}</strong><span class="stored-code-status">{{ item.status === 'active' ? 'Ready to use' : item.status === 'used' ? 'Used' : 'Replaced or revoked' }}</span></div><p>Expires {{ expiry(item.expiresAt) }}</p><input :value="item.code" readonly :aria-label="`Setup code for ${item.name}`" @focus="($event.target as HTMLInputElement).select()"><div class="message-actions"><button class="plain-button" @click="copy(item.code, item.id)"><UiIcon :name="copiedCode === item.id ? 'check' : 'copy'" /> {{ copiedCode === item.id ? 'Copied' : 'Copy code' }}</button><button class="plain-button danger-button" :disabled="busy" @click="deletingCode = item.id"><UiIcon name="trash" /> Delete</button></div><div v-if="deletingCode === item.id" class="restore-confirmation"><p>Delete this code now? It will stop working immediately and cannot be recovered.</p><div class="message-actions"><button class="restore-confirm-button" :disabled="busy" @click="deleteSetupCode(item.id)">Delete code</button><button class="plain-button" @click="deletingCode = ''">Cancel</button></div></div></article></details>
    <p v-if="status" class="settings-feedback-success" role="status">{{ status }}</p><p v-if="failure" class="form-error" role="alert">{{ failure }}</p>
    <div class="account-list"><article v-for="account in visible" :key="account.id" class="account-row"><div class="person-manager-main"><span class="avatar" :class="personTone(account.name)">{{ personInitial(account.name) }}</span><div><strong>{{ account.name }}</strong><p class="account-status">{{ account.role === 'admin' ? 'Administrator' : account.status === 'pending' ? 'Awaiting your approval' : account.status === 'approved' ? 'Approved · awaiting password' : 'Active' }}<span v-if="account.status === 'active'"> / {{ account.privateOnly ? 'Private chats only' : 'Shared room allowed' }}</span><span v-if="account.canEditCms && account.role !== 'admin'"> / Room editor</span><span v-if="account.builtin"> · Default</span></p></div></div>
      <div v-if="account.role !== 'admin'" class="message-actions account-controls">
        <button v-if="account.status !== 'active'" class="small-primary" :disabled="busy" @click="act(account.id, 'approve')">{{ account.status === 'approved' ? 'New setup code' : 'Approve & get code' }}</button>
        <template v-else><button class="plain-button" :disabled="busy" @click="act(account.id, account.privateOnly ? 'allow-shared' : 'block-shared')">{{ account.privateOnly ? 'Allow shared room' : 'Remove shared-room access' }}</button><button class="plain-button" :disabled="busy" @click="act(account.id, account.canEditCms ? 'block-cms' : 'allow-cms')">{{ account.canEditCms ? 'Remove room editing' : 'Allow room editing' }}</button><button class="plain-button" :disabled="busy" @click="act(account.id, account.canChangePassword ? 'cancel-password' : 'allow-password')">{{ account.canChangePassword ? 'Cancel password permission' : 'Allow password change' }}</button><button class="plain-button" :disabled="busy" @click="ask(account, 'reset')">Reset password</button><button class="plain-button" :disabled="busy" @click="ask(account, 'revoke')">Sign out devices</button></template>
        <button v-if="!account.builtin" class="plain-button danger-button" :disabled="busy" @click="ask(account, 'delete')"><UiIcon name="trash" /> Remove</button>
      </div>
      <div v-if="confirmation?.id === account.id" class="restore-confirmation"><p>{{ confirmation.action === 'delete' ? `Remove ${account.name} and revoke their access? Messages remain.` : confirmation.action === 'reset' ? `Reset ${account.name}’s password? Their old password and sessions will stop working. Share the new setup code privately.` : `Sign ${account.name} out of every device? They can sign in again with their password.` }}</p><div class="message-actions"><button class="restore-confirm-button" :disabled="busy" @click="act(confirmation.id, confirmation.action)">Confirm</button><button class="plain-button" @click="confirmation = null">Cancel</button></div></div>
    </article></div>
    <details v-if="removed.length" class="removed-accounts"><summary>Removed accounts ({{ removed.length }})</summary><div v-for="account in removed" :key="account.id" class="removed-account"><span>{{ account.name }}</span><button class="plain-button" :disabled="busy" @click="act(account.id, 'approve')">Approve again</button></div></details>
    <button class="restore-button names-reset-button" :disabled="busy || !visible.some(account => !account.builtin)" @click="resetConfirm = !resetConfirm; confirmation = null"><UiIcon name="rotate" /> Reset names to defaults</button>
    <div v-if="resetConfirm" class="restore-confirmation"><strong>Keep only the default accounts?</strong><p>All added accounts lose access immediately. Messages remain. Andrew, Darius, Harrison and Lucy keep their current passwords and approval status.</p><div class="message-actions"><button class="restore-confirm-button" :disabled="busy" @click="reset">Yes, reset names</button><button class="plain-button" @click="resetConfirm = false">Cancel</button></div></div>
  </section>
</template>
