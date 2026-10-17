<script setup lang="ts">
const { enabled, supported, busy, status, sync, toggle, test } = useDeviceNotifications()
onMounted(sync)
</script>
<template>
  <section class="manage-card" id="notifications">
    <div class="card-title"><span class="card-icon"><UiIcon name="bell" /></span><div><h2>Device notifications</h2><p>{{ enabled ? 'Enabled on this device' : 'Get notified when someone sends you a message' }}</p></div></div>
    <p class="field-help">Receive alerts in your device’s notification centre, even when SQ Chat is in the background. Message text stays private. Enable this separately on each device.</p>
    <div class="account-actions"><button class="primary-button" :disabled="busy || !supported" @click="toggle"><UiIcon name="bell" />{{ busy ? 'Updating…' : enabled ? 'Turn off notifications' : 'Enable notifications' }}</button><button v-if="enabled" class="plain-button" @click="test">Send a test notification</button></div>
    <p v-if="status" class="field-help" role="status">{{ status }}</p>
    <p class="field-help">On iPhone or iPad: Share → Add to Home Screen, open SQ Chat there, then enable notifications. Focus mode, device settings and connectivity can delay alerts.</p>
  </section>
</template>
