# SQ Chat

A Nuxt 4 group chat with Andrew, Darius and Harrison as permanent names. Anyone can add a name and chat without signing in. Each name's first initial appears in its avatar. Open pages receive changes through a server-sent event stream backed by Postgres notifications. The selected name stays in page memory only; the app does not use browser storage.

The public **Manage chat** page at `/manage` edits the room text, colours, font, bubble shape, and message and text animations. Its **Restore defaults** action resets every room setting and broadcasts the change while keeping messages. The Names card can remove added names or reset the picker to the permanent three; older messages stay. It can also edit or delete messages. Because this is deliberately password-free, anyone with the URL can use the CMS and can choose any available sender name. On hover or keyboard focus, the separate S and Q characters high five, smile, and return to their starting positions. Icons are drawn as SVGs rather than emoji.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Without a database URL, local development stores data in `.data/chat.json`.

## Deploy

Set `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to Neon Postgres connection strings on the server. The unpooled connection is used for `LISTEN/NOTIFY`, while regular queries use `DATABASE_URL`. The server creates its tables on first use. The Vercel project receives these variables from its isolated Neon database through Vercel Storage. Keep the connection strings server-side; do not use a `NUXT_PUBLIC_` variable.

```bash
npm run typecheck
npm run build
vercel --prod
```

Production refuses to use local file storage if `DATABASE_URL` is missing, since Vercel Functions do not share a durable filesystem.
