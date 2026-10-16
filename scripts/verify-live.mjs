const base = process.argv[2] || 'http://localhost:3001'
const timeoutMs = 20000

async function request(path, options) {
  const response = await fetch(new URL(path, base), options)
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  return response.json()
}

async function subscriber() {
  const controller = new AbortController()
  const response = await fetch(new URL('/api/events', base), {
    headers: { Accept: 'text/event-stream' },
    signal: controller.signal
  })
  if (!response.ok || !response.body) throw new Error(`Event stream: ${response.status}`)

  let changes = 0
  let ready = false
  let buffer = ''
  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  const task = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
        let end
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const event = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (event.includes('event: ready')) ready = true
          if (event.includes('event: change')) changes++
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') throw error
    }
  })()

  return {
    snapshot: () => ({ ready, changes }),
    close: async () => { controller.abort(); await task.catch(() => {}) }
  }
}

async function waitFor(check, label) {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

const clients = []
let message
let extraName
try {
  clients.push(await subscriber(), await subscriber())
  await waitFor(() => clients.every(client => client.snapshot().ready), 'both streams to be ready')
  const state = await request('/api/state')
  if (!['Andrew', 'Darius', 'Harrison'].every(name => state.people.includes(name))) throw new Error('Default names are missing')

  const protectedDelete = await fetch(new URL('/api/people', base), {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Andrew' })
  })
  if (protectedDelete.status !== 403) throw new Error(`Default name deletion returned ${protectedDelete.status}, expected 403`)

  const baseline = clients.map(client => client.snapshot().changes)
  extraName = `Check${crypto.randomUUID().slice(0, 8)}`
  await request('/api/people', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: extraName })
  })
  await waitFor(() => clients.every((client, index) => client.snapshot().changes > baseline[index]), 'name add on both streams')
  if (!(await request('/api/state')).people.includes(extraName)) throw new Error('Added name did not persist')

  const afterName = clients.map(client => client.snapshot().changes)
  message = await request('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: extraName, body: `Live check ${crypto.randomUUID()}` })
  })
  await waitFor(() => clients.every((client, index) => client.snapshot().changes > afterName[index]), 'message event on both streams')
  if (!(await request('/api/state')).messages.some(item => item.id === message.id)) throw new Error('Message did not persist')

  const afterMessage = clients.map(client => client.snapshot().changes)
  await request('/api/people', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: extraName })
  })
  extraName = undefined
  await waitFor(() => clients.every((client, index) => client.snapshot().changes > afterMessage[index]), 'name removal on both streams')
  const afterRemoval = await request('/api/state')
  if (afterRemoval.people.includes(message.sender) || !afterRemoval.messages.some(item => item.id === message.id)) throw new Error('Removed name or message history is incorrect')

  const afterPeople = clients.map(client => client.snapshot().changes)
  await request('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.settings)
  })
  await waitFor(() => clients.every((client, index) => client.snapshot().changes > afterPeople[index]), 'CMS event on both streams')

  const afterSettings = clients.map(client => client.snapshot().changes)
  await request(`/api/messages/${message.id}`, { method: 'DELETE' })
  message = undefined
  await waitFor(() => clients.every((client, index) => client.snapshot().changes > afterSettings[index]), 'delete event on both streams')
  console.log(`Live chat verified at ${base}: protected defaults, added name, message, removed name, CMS, and delete events on two streams.`)
} finally {
  if (message) await request(`/api/messages/${message.id}`, { method: 'DELETE' }).catch(() => {})
  if (extraName) await request('/api/people', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: extraName })
  }).catch(() => {})
  await Promise.all(clients.map(client => client.close()))
}
