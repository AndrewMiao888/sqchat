export default defineNuxtConfig({
  compatibilityDate: '2026-10-16',
  css: ['~/assets/css/main.css', '~/assets/css/theme.css'],
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
