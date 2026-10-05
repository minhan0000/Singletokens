# SingleTokens

Pay for AI per use, with no subscription. Users buy SingleTokens and spend them on any model.

- 100,000 SingleTokens = €1 (a 35% markup is included).
- Every message is charged on the server from the real token usage the provider reports.
- Models run through [OpenRouter](https://openrouter.ai).

## Project layout

```
backend/
  server.js           Express server and all API routes
  db.js               Postgres (Neon) tables and queries
  auth.middleware.js  Checks the login token on protected routes
  openrouter.js       Model calls, prices, and the SingleTokens conversion
frontend/
  index.html          Landing page
  login.html          Log in / sign up
  app.html            The app (desktop)
  app-mobile.html     The app (phone)
  app-script.js       App logic
  api.js              Talks to the backend
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
| `OPENROUTER_API_KEY` | yes | Key from https://openrouter.ai/keys. Used for every AI reply. |
| `PORT` | no | Port the server listens on. Default `3001`. |

## Security notes

- Every AI route needs a valid login.
- Rate limits: 20 chat messages per minute per user, 10 login/sign-up attempts per 15 minutes per IP address.
- No CORS headers are sent, so only pages served by this server can call the API.
- The server expects to run behind one reverse proxy (as on most hosting platforms) so the rate limit sees real visitor IPs.
