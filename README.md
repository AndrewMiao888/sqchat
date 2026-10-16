# SQ Chat

A Nuxt 4 group chat for Andrew, Darius and Harrison. Anyone can choose one of the three names and send a message without signing in. The room updates automatically every two seconds while open; no page refresh is needed.

The public **Manage chat** page at `/manage` edits the room title, description, note and empty-chat message, and can edit or delete messages. Because this is deliberately password-free, anyone with the URL can use the CMS and can choose any sender name.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Without a database URL, local development stores data in `.data/chat.json`.

## Deploy

Set `DATABASE_URL` to a Neon Postgres connection string on the server. The server creates its tables on first use. The Vercel project can receive this variable by connecting an isolated Neon database through Vercel Storage. Keep the connection string server-side; do not use a `NUXT_PUBLIC_` variable.

```bash
npm run typecheck
npm run build
vercel --prod
```

Production refuses to use local file storage if `DATABASE_URL` is missing, since Vercel Functions do not share a durable filesystem.
