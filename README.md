# SQ Chat

Nuxt 4 chat with a shared room and private conversations for two or more people. Andrew approves new conversations and membership additions requested by other people. He can allow automatic approval for individual people. Newly added people can read a chat's history. Andrew can read and moderate every conversation; this is disclosed in the interface. Private chats are access controlled, not end-to-end encrypted.

## Accounts

- Andrew is the only administrator. He can grant other active people access to the room editor in the CMS.
- Andrew approves Darius, Harrison, and additional accounts, then privately shares a one-use setup code. New codes expire after 3 days. Andrew can reopen or delete them in the Code store until expiry. Owners choose their passwords; Andrew does not see them.
- Andrew's last open chat is saved on the server and reopens when he returns. Selecting Everyone saves the shared room as his last chat.
- Members need Andrew's one-use, 24-hour permission to change their password. A forgotten password can be reset by Andrew issuing a new setup code. Changes and resets revoke sessions immediately.
- Andrew, Darius, Harrison, and Lucy cannot be deleted. Removing an additional account revokes access and preserves history. Reset names keeps these default accounts and preserves their credentials.
- Password login only. Andrew's initial password is provisioned separately and is never included in source code, client assets, or logs. It is not forcibly changed.

The CMS controls room text, colours, fonts, bubble shape, message entrances, text animations, and message moderation. Restore all defaults resets the room settings. The SVG/CSS S and Q logo retains its high-five and smile animation. There are no emoji UI controls.

## Live updates and security

Postgres `LISTEN/NOTIFY` and authenticated server-sent events update open pages without refreshes. Private change notifications go only to participants and Andrew. Streams reconnect and recheck sessions. Each chat shows which eligible members are online and who is typing. Typing state contains no message text and expires shortly after input stops; a disconnected tab drops from the online list after its stream lease expires. Browser state uses memory and an HttpOnly session cookie; no localStorage or sessionStorage is used. Chat data is stored in Postgres.

Andrew can grant or remove room editing access for an active account in Settings > Accounts. Room editors can change the room text and appearance, including restoring defaults. Account approvals, passwords, access decisions, audit logs and message moderation remain Andrew-only. Removing permission blocks further settings saves immediately.

Passwords use salted scrypt (`N=131072, r=8, p=1`). Session tokens are random 256-bit values; setup codes are random 6- or 12-digit numbers. New codes are stored as hashes for verification and encrypted for Andrew's 3-day Code store. Production cookies use `__Host-`, Secure, HttpOnly and SameSite Strict. Sessions renew while used and expire after one year without activity, with no fixed lifetime limit. Credential versions invalidate concurrent stale logins after a reset or revocation. There are limits on sign-in attempts, messages, writes, and concurrent live tabs; mutation requests require same-origin JSON and a CSRF token. The server checks permissions on every protected API request and uses parameterized SQL. Responses use no-store, nonce CSP, frame protection, HSTS, and other restrictive headers. Andrew can review an audit log that excludes passwords and message contents.

## Local development

Node 24 and a Neon Postgres database are required. Copy `.env.example` to `.env.local` and fill in the two server-only database URLs and private Blob token. No file-storage fallback is used for authenticated chat.

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

Production needs a private Vercel Blob store connected as `BLOB_READ_WRITE_TOKEN`, plus `DATABASE_URL` and `DATABASE_URL_UNPOOLED` from Vercel's Neon integration. The second connection is for live notifications. Never use `NUXT_PUBLIC_` for secrets. Database migrations are additive and preserve the original group messages and settings. Existing additional names become pending accounts.

To test a running build, set `SQ_ADMIN_PASSWORD` securely and run:

```sh
node --env-file=.env.local scripts/verify-security.mjs http://localhost:3001
```

The integration check creates uniquely named temporary accounts and conversations, verifies authorization, password workflows, revocation, CSP, SSR pages, and live delivery between multiple clients, and removes its fixtures in `finally`. It saves the existing settings unchanged to verify broadcasts. It never resets real users or deletes existing messages. Use the database connected to the tested deployment.

## Media and effects

Attach up to four files per message, up to 20 MB each. Image, audio and video previews appear in the conversation. Downloads preserve filenames; Save / share photo uses the device share sheet when supported, with a download fallback. Saving to Photos uses the phone's share menu or touch-and-hold image menu. Codec playback depends on the browser; every attachment can also be downloaded.

Files live in private Vercel Blob storage. Scoped upload tokens allow one path, type and size for 15 minutes. Metadata and message ownership live in Postgres. Every download checks the current session and conversation membership, including range requests for seeking. Inline images require valid file signatures. HTML, SVG and executable uploads are not accepted. Other files are forced downloads. This is not a malware-scanning service. The application reserves a total 500 MB for uploads and limits each account to 30 upload attempts per hour. Pending uploads expire after 24 hours; stale and deleted objects are cleaned opportunistically on later uploads.

Effects opens a compact picker; holding Send also opens bubble effects. Select words to animate them, or apply an effect to the entire text. Text effects: Big, Small, Shake, Nod, Explode, Ripple, Bloom and Jitter. Bubble effects: Slam, Loud, Gentle and Invisible Ink. Screen effects: Echo, Spotlight, Balloons, Confetti, Love, Lasers, Fireworks and Celebration. Invisible Ink reveals on swipe or tap and hides after 12 seconds. Screen effects are suppressed for invisible messages so concealed words are never echoed in the backdrop.

Birthday, congratulations, new-year and selected holiday greetings trigger matching screen effects when automatic greetings are enabled. Recipients can replay effects, disable them, or enable optional synthesized sound. Sounds start off. Reduced-motion preferences suppress animations. Screen effects can be dismissed. Viewer playback preferences stay in memory only. These are original web animations, not Apple's proprietary effects.

## Lucy and conversation deletion

Lucy is a default private-only account, initialized using `SQ_LUCY_INITIAL_PASSWORD` and `scripts/initialize-lucy.mjs`. The script reuses an unclaimed Lucy profile, hashes the password, and creates a private Andrew-Lucy conversation without a setup code. It does not overwrite an established password. Lucy can start private chats with any approved active person, including groups. Shared-room access starts off. Andrew can allow or remove shared-room access for Lucy or any other member in Settings. Permission changes update open tabs immediately; removing access never deletes existing messages. Her initial login opens her default private conversation.

Andrew chooses the length of newly issued numeric account setup codes in Settings: 6 digits by default or 12 digits. New codes expire after 3 days and work once. Used and replaced codes stay in the Code store until their original expiry, when daily cleanup removes them; any code can be deleted early. Setup attempts are rate limited. Codes issued before the archive upgrade keep their original expiry and are not recoverable from their hashes.

Andrew can create private chats without joining, add or remove any participant, and retain empty conversations with their history. He can review every chat and add himself when he wants to send. Only Andrew can delete a private conversation or clear the shared room, including attached files. Deletions notify participants live, revoke file access and remove stored objects. Default conversations are not recreated automatically after Andrew deletes them.

## Browser and media verification

Install the isolated browser with `npx playwright install chromium`, then set `SQ_ADMIN_PASSWORD` securely and run:

```sh
node --env-file=.env.local scripts/verify-rich-chat.mjs http://localhost:3001
```

This suite creates temporary accounts and private conversations, uploads generated photo/audio/video/text fixtures, verifies exact downloads and access controls, and exercises the actual browser composer, effects, invisible ink, long-press Send, reduced motion, photo viewer, live updates, and mobile layout. It removes all fixtures in `finally`; screenshots go into ignored `test-results/`. Set `SQ_LUCY_PASSWORD` to additionally verify the provisioned Lucy login. The older security suite verifies account approval, password setup/reset/permission, session revocation, live filtering and moderation.

### Dependency audit (17 October 2026)

Compatible audit fixes were applied. npm still reports 11 high findings inherited through build/development dependencies from two upstream advisories with no patched release: [braces recursion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv). Neither package is included in the built server dependencies, and chat requests do not call either library. Track upstream fixes; do not use the suggested forced Nuxt downgrade as an automatic remedy.

## Replies and retained history

Choose Reply under a message to quote it in the composer. Replies are live and support text, effects and attachments. Quoted previews are resolved from the original message in the same conversation, so Andrew's edits update quotes and deleting an original replaces its quote with a deletion notice. Invisible-ink originals have a concealed quote preview. Click a quote to jump to a loaded original; Load older messages retrieves earlier history in pages of 200. Loaded history refreshes with moderation changes. Messages are retained until Andrew deletes them or clears the conversation; changing account or room access never removes them.

## App download recovery

If a route's JavaScript download fails during startup or navigation, the app retries once with a fresh document at the intended route. A timestamp in the URL prevents a reload loop and is removed after successful startup. Recovery does not write authentication, chat state or drafts to localStorage or sessionStorage. Unsent text stays in memory on the recovery screen, where it can be copied before a manual retry; unsent files must be attached again. Persistent failures offer a clear Try again action. With `SQ_ADMIN_PASSWORD` set, run `node scripts/verify-recovery.mjs http://localhost:3001` against a built server to test interrupted downloads, navigation, loop prevention and draft protection.


## Device notifications

Enable in My account > Device notifications on each device. Web Push dispatches after a message is saved, with high urgency and a one-hour delivery TTL. Vercel's request waitUntil keeps dispatch alive after the message response. Browser permission is required; iOS/iPadOS 16.4+ requires adding SQ Chat to the Home Screen. Delivery timing depends on connectivity, browser/OS settings and Focus mode.

Subscriptions are bound to a server session and cascade away on sign-out/revocation. Only active shared-room members or private-chat participants receive notifications; senders are excluded. Lock-screen previews contain no message text or sender names. The service worker caches no conversations and notification clicks preserve the app's unsent-message navigation guard. VAPID signing keys are generated once and stored in server-only sq_config; include this table in protected database backups. No notification settings or messages use localStorage.

The SVG favicon follows accent colour changes immediately in chat and settings. Installed app icons remain the SQ brand icon (platforms cache these separately).

Members can delete their own messages in chats they can access; Andrew can delete any message. Deletion removes the message for everyone, revokes attachments and leaves existing reply quotes marked as deleted. Conversation deletion remains administrator-only.
