# SingleTokens

Pay for AI per use, with no subscription, on any model.

- Models run through [OpenRouter](https://openrouter.ai). Each user connects their own OpenRouter
  account ("Connect OpenRouter") and pays OpenRouter directly. SingleTokens never handles money.
- SingleTokens is the display unit for cost: 100,000 SingleTokens = $1 of OpenRouter credit, no markup.
- Users' OpenRouter keys are stored encrypted in the database.

## Project layout

```
backend/
  server.js           Express server and all API routes
  db.js               Postgres (Neon) tables and queries
  auth.middleware.js  Checks the login token on protected routes
  openrouter.js       Model calls, prices, the "Connect OpenRouter" exchange, key encryption
frontend/
  index.html          Landing page
  login.html          Log in / sign up
  connect.html        Where OpenRouter sends users back after connecting
  app.html            The app (one page for phone and desktop)
  ui-kit.html         Every UI component in both themes, for design checks
  css/theme.css       Colors, fonts, sizes (dark + white)
  css/app.css         Component and layout styles
  js/app.js           Starts the app, switches screens
  js/api.js           Talks to the backend
  js/ui.js            Shared helpers (Markdown, menus, modals, toasts)
  js/sidebar.js, chat.js, models.js, gpts.js, custom.js, openrouter.js, settings.js   One file per screen
```

## Setup

You need Node.js 18 or newer and a Postgres database (a free [Neon](https://neon.tech) project works).

```bash
npm install
cp .env.example .env    # then fill in the values, see below
npm start               # or: npm run dev  (restarts on file changes)
```

Open http://localhost:3001. The database tables are created automatically on first start.

## Environment variables

| Name | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string from Neon. |
| `JWT_SECRET` | yes | Long random string used to sign login tokens. The server won't start without it. |
| `ENCRYPTION_KEY` | yes | 64 hex characters used to encrypt users' OpenRouter keys. Changing it later forces every user to reconnect. |
| `PORT` | no | Port the server listens on. Default `3001`. |

## Connecting OpenRouter

When a user first sends a message, the app shows "Connect OpenRouter". They approve on openrouter.ai
and are sent back to `/connect.html`, which hands a one-time code to the server. The server trades it
for the user's own OpenRouter key and stores it encrypted. OpenRouter only sends users back to
`https://` addresses or `localhost`, so test locally on `http://localhost:<PORT>`.

Deleting a SingleTokens account erases the stored key. The key itself still exists in the user's
OpenRouter account until they delete it at https://openrouter.ai/settings/keys.

## Security notes

- Every AI route needs a valid login.
- Rate limits: 20 chat messages per minute per user, 10 login/sign-up attempts per 15 minutes per IP address.
- No CORS headers are sent, so only pages served by this server can call the API.
- The server expects to run behind one reverse proxy (as on most hosting platforms) so the rate limit sees real visitor IPs.
