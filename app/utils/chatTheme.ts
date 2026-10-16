import type { ChatSettings } from '#shared/types/chat'

const fonts: Record<ChatSettings['fontFamily'], string> = {
  sans: "'DM Sans', Arial, sans-serif",
  rounded: "'Nunito', 'DM Sans', Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SFMono-Regular', Consolas, monospace"
}

export function chatThemeStyle(settings: ChatSettings) {
  const red = parseInt(settings.accentColor.slice(1, 3), 16)
  const green = parseInt(settings.accentColor.slice(3, 5), 16)
  const blue = parseInt(settings.accentColor.slice(5, 7), 16)
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return {
    '--chat-page-bg': settings.pageBackground,
    '--chat-panel-bg': settings.panelBackground,
    '--chat-bubble-bg': settings.bubbleBackground,
    '--chat-accent': settings.accentColor,
    '--chat-accent-contrast': luminance > .6 ? '#1c241c' : '#ffffff',
    '--chat-ink': settings.textColor,
    '--chat-font': fonts[settings.fontFamily]
  }
}
