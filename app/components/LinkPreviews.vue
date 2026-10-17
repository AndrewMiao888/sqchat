<script setup lang="ts">
import { messageLinks } from '#shared/utils/links'
const props = defineProps<{ text: string }>()
const { api } = useAuth()
const links = computed(() => messageLinks(props.text))
const root = ref<HTMLElement>()
const visible = ref(false)
const previews = ref<Record<string, { title?: string; description?: string }>>({})
let observer: IntersectionObserver | undefined
watch([visible, links], async ([shown, current]) => {
  if (!shown) return
  await Promise.all(current.map(async link => {
    if (previews.value[link.url]) return
    previews.value[link.url] = {}
    try { previews.value[link.url] = await api('/api/link-preview', { query: { url: link.url } }) } catch { /* The original link always remains usable. */ }
  }))
})
onMounted(() => {
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { visible.value = true; observer?.disconnect() }
  }, { rootMargin: '150px' })
  watch(root, element => { if (element && !visible.value) observer?.observe(element) }, { immediate: true })
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <div v-if="links.length" ref="root" class="link-previews">
    <a v-for="link in links" :key="link.url" class="link-preview" :href="link.url" target="_blank" rel="noopener noreferrer" :aria-label="`Open ${previews[link.url]?.title || link.host} in a new tab`">
      <span class="link-preview-host"><UiIcon name="arrow-up-right" />{{ link.host }}</span>
      <strong>{{ previews[link.url]?.title || link.label }}</strong>
      <span v-if="previews[link.url]?.description" class="link-preview-description">{{ previews[link.url]?.description }}</span>
      <span class="link-preview-address">{{ link.url }}</span>
    </a>
  </div>
</template>
<style scoped>
.link-previews{display:grid;gap:8px;min-width:0;margin-top:10px}
.link-preview{display:grid;gap:6px;min-width:0;max-width:100%;padding:12px;border:1px solid currentColor;border-radius:12px;color:inherit;text-decoration:none;overflow-wrap:anywhere;background:rgb(255 255 255 / .3)}
.link-preview:hover{background:rgb(255 255 255 / .6)}
.link-preview:focus-visible{outline:2px solid currentColor;outline-offset:3px}
.link-preview-host{display:flex;align-items:center;gap:6px;font-size:12px;opacity:.75;min-width:0;overflow-wrap:anywhere}
.link-preview-host :deep(svg){width:15px;height:15px;flex-shrink:0}
.link-preview-description{font-size:13px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.link-preview-address{font-size:11px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>
