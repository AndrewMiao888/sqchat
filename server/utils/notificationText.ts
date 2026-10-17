import type { ChatSettings } from '#shared/types/chat'

export function messageNotification(sender: string, body: string, types: string[], invisible = false) {
  if (invisible) return `${sender} sent an invisible ink message.`
  const groups = [
    ['photo', types.filter(type => type.startsWith('image/')).length],
    ['video', types.filter(type => type.startsWith('video/')).length],
    ['audio file', types.filter(type => type.startsWith('audio/')).length],
    ['file', types.filter(type => !/^(image|video|audio)\//.test(type)).length]
  ] as const
  const media = groups.filter(([, count]) => count).map(([name, count]) => count === 1 ? `a${name === 'audio file' ? 'n' : ''} ${name}` : `${count} ${name}s`)
  const description = media.length > 1 ? `${media.slice(0, -1).join(', ')} and ${media.at(-1)}` : media[0]
  const text = body.replace(/\s+/g, ' ').trim()
  const preview = Array.from(text).slice(0, 240).join('') + (Array.from(text).length > 240 ? '…' : '')
  return description ? `${sender} sent ${description}${preview ? ` and said: ${preview}` : '.'}` : `${sender} said: ${preview}`
}

export function settingsNotification(sender: string, before: ChatSettings, after: ChatSettings) {
  const labels: Record<keyof ChatSettings, string> = {
    title: 'chat title', subtitle: 'chat subtitle', notice: 'notice', welcome: 'welcome text',
    pageBackground: 'background colour', panelBackground: 'panel colour', bubbleBackground: 'message bubble colour',
    accentColor: 'accent colour', textColor: 'text colour', fontFamily: 'font', messageAnimation: 'message animation',
    textAnimation: 'text animation', bubbleStyle: 'bubble style'
  }
  const changes = (Object.keys(labels) as (keyof ChatSettings)[]).filter(key => before[key] !== after[key]).map(key => labels[key])
  if (!changes.length) return null
  const summary = changes.length > 3 ? `${changes.slice(0, 2).join(', ')} and ${changes.length - 2} other settings`
    : changes.length > 1 ? `${changes.slice(0, -1).join(', ')} and ${changes.at(-1)}` : changes[0]
  return `${sender} changed the ${summary}.`
}
