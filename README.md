# SingleTokens

KI-Chat-Plattform mit Token-basiertem Bezahlsystem.

## Projektstruktur

```
SingleTokens/
├── package.json          # Root-Config, Start-Script
├── .gitignore
├── backend/
│   ├── server.js         # Express-Server, alle API-Routen
│   ├── db.js             # sql.js Datenbanklogik
│   └── auth.middleware.js # JWT-Authentifizierung
└── frontend/
    ├── index.html        # Landingpage
    ├── login.html        # Login / Registrierung
    ├── app.html          # Desktop-App
    ├── index-mobile.html # Mobile-App
    └── api.js            # Frontend ↔ Backend Kommunikation
```

## Setup

```bash
npm install
cp .env.example .env   # JWT_SECRET und GROQ_API_KEY setzen
npm start
```

## Umgebungsvariablen

| Variable      | Beschreibung                  |
|---------------|-------------------------------|
| `JWT_SECRET`  | Geheimer Schlüssel für JWTs   |
| `GROQ_API_KEY`| API-Key für Groq              |
| `PORT`        | Server-Port (Standard: 3001)  |
| `NODE_ENV`    | `production` für Render.com   |

## Deployment (Render.com)

- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Umgebungsvariablen:** `JWT_SECRET`, `GROQ_API_KEY`, `NODE_ENV=production`
