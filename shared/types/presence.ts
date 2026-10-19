export interface PresenceState {
  members: { id: string; name: string; online: boolean; typing: boolean }[]
}
