export function personInitial(name: string): string {
  return [...name.trim()][0]?.toLocaleUpperCase() || '?'
}

export function personTone(name: string): string {
  const defaultTone = name.toLowerCase()
  return ['andrew', 'darius', 'harrison'].includes(defaultTone) ? defaultTone : 'extra'
}
