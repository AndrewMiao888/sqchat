export default defineNuxtRouteMiddleware(async () => {
  const user = await useAuth().load()
  if (!user) return navigateTo('/login')
  if (!user.canEditCms && !user.canModerateMessages) return navigateTo('/')
})
