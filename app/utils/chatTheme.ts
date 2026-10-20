import type { ChatSettings, ConversationTheme } from '#shared/types/chat'

const fonts: Record<ChatSettings['fontFamily'], string> = {
  sans: "'DM Sans', Arial, sans-serif",
  rounded: "'Nunito', 'DM Sans', Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SFMono-Regular', Consolas, monospace"
}

export function chatThemeStyle(settings: ChatSettings, theme?: ConversationTheme) {
  const accentColor = theme?.accentColor || settings.accentColor
  const red = parseInt(accentColor.slice(1, 3), 16)
  const green = parseInt(accentColor.slice(3, 5), 16)
  const blue = parseInt(accentColor.slice(5, 7), 16)
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  const pageBackground = theme?.backgroundStart || settings.pageBackground
  const pageImage = theme?.backgroundMode === 'gradient'
    ? `linear-gradient(${theme.gradientAngle}deg, ${theme.backgroundStart}, ${theme.backgroundEnd})`
    : theme?.backgroundMode === 'image' && theme.backgroundImageId
      ? `url("/api/theme-background/${theme.backgroundImageId}")`
      : 'none'
  return {
    '--chat-page-bg': pageBackground,
    '--chat-page-image': pageImage,
    '--chat-panel-bg': theme?.panelColor || settings.panelBackground,
    '--chat-bubble-bg': theme?.bubbleColor || settings.bubbleBackground,
    '--chat-accent': accentColor,
    '--chat-accent-contrast': luminance > .6 ? '#1c241c' : '#ffffff',
    '--chat-ink': settings.textColor,
    '--chat-font': fonts[settings.fontFamily]
  }
}
