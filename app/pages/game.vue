<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { auth } = useAuth()
useHead({ title: 'Kour.io / SQ Chat' })
</script>

<template>
  <div class="site-shell game-page">
    <header class="topbar">
      <BrandLogo />
      <span class="topbar-caption">Kour.io</span>
      <nav class="topbar-actions">
        <NuxtLink to="/" class="topbar-link"><UiIcon name="arrow-left" /> Chat</NuxtLink>
        <NuxtLink to="/account" class="topbar-link"><UiIcon name="user" /> {{ auth.user?.name }}</NuxtLink>
      </nav>
    </header>
    <main class="kour-frame-shell">
      <iframe
        class="kour-frame"
        src="https://kour.io/"
        title="Kour.io"
        allow="fullscreen; gamepad; clipboard-read; clipboard-write; autoplay"
        referrerpolicy="no-referrer"
      ></iframe>
    </main>
  </div>
</template>
