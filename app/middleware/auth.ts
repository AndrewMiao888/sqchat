export default defineNuxtRouteMiddleware(async () => {
  if (!await useAuth().load()) return navigateTo('/login')
})
