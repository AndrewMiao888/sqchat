import { EventEmitter } from 'node:events'

const localEvents = new EventEmitter()
localEvents.setMaxListeners(0)

export function publishLocalChange() {
  localEvents.emit('change')
}

export function listenForLocalChanges(onChange: () => void) {
  localEvents.on('change', onChange)
  return () => localEvents.off('change', onChange)
}
