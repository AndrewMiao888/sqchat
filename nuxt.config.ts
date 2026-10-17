export default defineNuxtConfig({
  compatibilityDate: '2026-10-16',
  // Recover failed route downloads without Nuxt persisting auth/chat state in sessionStorage.
  experimental: { emitRouteChunkError: 'manual' },
  css: ['~/assets/css/main.css', '~/assets/css/theme.css', '~/assets/css/auth.css', '~/assets/css/effects.css'],
  app: {
    head: {
      title: 'SQ Chat',
      meta: [
        { name: 'description', content: 'A simple shared chat for Andrew, Darius and Harrison.' },
        { name: 'theme-color', content: '#f7f6f2' }
      ]
    }
  }
})
