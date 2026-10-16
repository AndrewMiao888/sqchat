# SQ Chat

Nuxt 4 chat with a shared room and private conversations for two or more people. Participants are added immediately, including when someone is added to an existing conversation. Newly added people can read its history. Andrew can read and moderate every conversation; this is disclosed in the interface. Private chats are access controlled, not end-to-end encrypted.

## Accounts

- Andrew is the only administrator and the only person with access to the CMS.
- Andrew approves Darius, Harrison, and additional accounts, then privately shares a one-use setup code. Codes expire after 24 hours. Owners choose their passwords; Andrew does not see them.
- Members need Andrew's one-use, 24-hour permission to change their password. A forgotten password can be reset by Andrew issuing a new setup code. Changes and resets revoke sessions immediately.
- Andrew, Darius, and Harrison cannot be deleted. Removing an additional account revokes access and preserves history. Reset names keeps the original three and preserves their credentials.
- Password login only. Andrew's initial password is provisioned separately and is never included in source code, client assets, or logs. It is not forcibly changed.

The CMS controls room text, colours, fonts, bubble shape, message entrances, text animations, and message moderation. Restore all defaults resets the room settings. The SVG/CSS S and Q logo retains its high-five and smile animation. There are no emoji UI controls.

## Live updates and security

Postgres `LISTEN/NOTIFY` and authenticated server-sent events update open pages without refreshes. Private change notifications go only to participants and Andrew. Streams reconnect and recheck sessions. Browser state uses memory and an HttpOnly session cookie; no localStorage or sessionStorage is used. Chat data is stored in Postgres.

Passwords use salted scrypt (`N=131072, r=8, p=1`). Session tokens and setup codes are random 256-bit values; only their hashes are stored. Production cookies use `__Host-`, Secure, HttpOnly and SameSite Strict. Sessions have a 12-hour maximum and a 30-minute idle timeout. Credential versions invalidate concurrent stale logins after a reset or revocation. There are limits on sign-in attempts, messages, writes, and concurrent live tabs; mutation requests require same-origin JSON and a CSRF token. The server checks permissions on every protected API request and uses parameterized SQL. Responses use no-store, nonce CSP, frame protection, HSTS, and other restrictive headers. Andrew can review an audit log that excludes passwords and message contents.

## Local development

Node 24 and a Neon Postgres database are required. Copy `.env.example` to `.env.local` and fill in the two server-only database URLs. No file-storage fallback is used for authenticated chat.

```sh
npm install
npm run dev -- --dotenv .env.local
```

On a new database, submit an account request on the Join tab to initialize the tables. Set `SQ_ADMIN_INITIAL_PASSWORD` securely in the shell, then run this once:

```sh
node --env-file=.env.local scripts/initialize-admin.mjs
```

The command only initializes an unclaimed Andrew account; it cannot overwrite an active password. Clear the temporary environment variable afterward. Sign in as Andrew, open Settings, approve the reserved accounts, and share their setup codes privately.

## Verify and deploy

```sh
npm run typecheck
npm run build
vercel deploy --prod --yes
```

Production needs `DATABASE_URL` and `DATABASE_URL_UNPOOLED` from Vercel's Neon integration. The second connection is for live notifications. Never use `NUXT_PUBLIC_` for secrets. Database migrations are additive and preserve the original group messages and settings. Existing additional names become pending accounts.

To test a running build, set `SQ_ADMIN_PASSWORD` securely and run:

```sh
node --env-file=.env.local scripts/verify-security.mjs http://localhost:3001
```

The integration check creates uniquely named temporary accounts and conversations, verifies authorization, password workflows, revocation, CSP, SSR pages, and live delivery between multiple clients, and removes its fixtures in `finally`. It saves the existing settings unchanged to verify broadcasts. It never resets real users or deletes existing messages. Use the database connected to the tested deployment.
