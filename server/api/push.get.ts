import { pushKeys } from '../utils/push'
export default defineEventHandler(async () => ({ publicKey: (await pushKeys()).publicKey }))
