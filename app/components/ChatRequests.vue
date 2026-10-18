<script setup lang="ts">
type Request = { id: string; kind: 'create' | 'add'; requester: string; title: string; threadTitle: string | null; people: string[]; createdAt: string }
type Person = { id: string; name: string; autoApprove: boolean }
const { api } = useAuth()
const { data, refresh } = await useAsyncData('chat-requests', () => api<{ requests: Request[]; people: Person[] }>('/api/admin/chat-requests'), { default: () => ({ requests: [], people: [] }) })
const busy = ref('')
const feedback = ref('')
const failure = ref('')
useChatEvents(() => { void refresh() })
async function decide(request: Request, decision: 'approve' | 'decline') {
  if (busy.value) return
  busy.value = request.id; feedback.value = ''; failure.value = ''
  try {
    await api(`/api/admin/chat-requests/${request.id}`, { method: 'POST', body: { decision } })
    feedback.value = decision === 'approve' ? 'Chat request approved. Participants can use it now.' : 'Chat request declined.'
    await refresh()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not decide this request.' }
  finally { busy.value = '' }
}
async function setAutomatic(person: Person) {
  if (busy.value) return
  busy.value = person.id; feedback.value = ''; failure.value = ''
  try {
    await api('/api/admin/chat-auto-approve', { method: 'PUT', body: { id: person.id, allow: !person.autoApprove } })
    feedback.value = `${person.name}'s future chat decisions ${person.autoApprove ? 'now need your approval' : 'will be accepted automatically'}.`
    await refresh()
  } catch (error: any) { failure.value = error?.data?.statusMessage || 'Could not change this permission.' }
  finally { busy.value = '' }
}
</script>
<template>
  <section id="chat-requests" class="manage-card chat-requests-card"><div class="card-title"><span class="card-icon"><UiIcon name="users" /></span><div><h2>Chat requests <span class="message-count">{{ data.requests.length }}</span></h2><p>Approve new chats and changes to who is in them.</p></div></div>
    <p v-if="!data.requests.length" class="field-help">No requests waiting. Andrew’s own changes take effect immediately.</p>
    <article v-for="request in data.requests" :key="request.id" class="chat-request-row"><strong>{{ request.requester }}</strong><p>{{ request.kind === 'create' ? 'Wants to start a chat' : `Wants to add people to ${request.threadTitle || 'a chat'}` }} with {{ request.people.join(', ') }}{{ request.title ? ` · ${request.title}` : '' }}.</p><div class="message-actions"><button class="small-primary" :disabled="!!busy" @click="decide(request, 'approve')">Approve</button><button class="plain-button danger-button" :disabled="!!busy" @click="decide(request, 'decline')">Decline</button></div></article>
    <details class="chat-auto-approve"><summary>Always accept someone’s chat decisions</summary><p class="field-help">When enabled for a person, their new chats and additions take effect without your review. You can turn this off any time.</p><label v-for="person in data.people" :key="person.id"><span>{{ person.name }}</span><input type="checkbox" :checked="person.autoApprove" :disabled="!!busy" :aria-label="`Always accept ${person.name}'s chat decisions`" @change="setAutomatic(person)"></label></details>
    <p v-if="feedback" class="settings-feedback-success" role="status">{{ feedback }}</p><p v-if="failure" class="form-error" role="alert">{{ failure }}</p>
  </section>
</template>
