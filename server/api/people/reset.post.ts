import { resetPeople } from '../../utils/chat'

export default defineEventHandler(async () => ({ removed: await resetPeople() }))
