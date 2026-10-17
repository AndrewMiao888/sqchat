export function messageLinks(text: string) {
  const links: { url: string; host: string; label: string }[] = []
  for (const match of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi)) {
    const raw = match[0].replace(/[.,!?;:]+$/, '').replace(/\)+$/, suffix => {
      const opening = (match[0].match(/\(/g) || []).length
      const closing = (match[0].match(/\)/g) || []).length
      return suffix.slice(0, Math.max(0, suffix.length - Math.max(0, closing - opening)))
    })
    try {
      const url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || links.some(link => link.url === url.href)) continue
      links.push({ url: url.href, host: url.hostname, label: decodeURI(url.pathname).replace(/^\//, '') || url.hostname })
    } catch {}
    if (links.length === 3) break
  }
  return links
}
