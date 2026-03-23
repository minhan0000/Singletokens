# SingleTokens Backend v2

## Features
- ✅ Login & Registrierung (JWT, bcrypt)
- ✅ Token-Datenbank pro User (SQLite)
- ✅ Stripe Zahlungen (Kreditkarte, Google Pay)
- ✅ PayPal Zahlungen (Sandbox + Live)
- ✅ API-Key Verwaltung
- ✅ Chat-Verlauf speichern

## Setup

### 1. Abhängigkeiten installieren
```bash
npm install
```

### 2. .env erstellen
```bash
cp .env.example .env
# Dann alle Keys in .env eintragen
```

### 3. Starten
```bash
npm start        # Produktion
npm run dev      # Entwicklung (mit nodemon)
```

---

## API Endpoints

### Auth
| Method | URL | Auth | Beschreibung |
|--------|-----|------|--------------|
| POST | `/api/auth/register` | ❌ | Registrierung |
| POST | `/api/auth/login` | ❌ | Login → JWT |
| GET | `/api/auth/me` | ✅ | Eigenes Profil |
| PATCH | `/api/auth/me` | ✅ | Name ändern |

### API Keys
| Method | URL | Beschreibung |
|--------|-----|--------------|
| GET | `/api/keys` | Alle Keys (maskiert) |
| POST | `/api/keys` | Neuen Key erstellen |
| PATCH | `/api/keys/:id/revoke` | Key sperren |
| DELETE | `/api/keys/:id` | Key löschen |
| POST | `/api/keys/validate` | Key validieren |

### Chat-Verlauf
| Method | URL | Beschreibung |
|--------|-----|--------------|
| GET | `/api/chats` | Alle Chats |
| GET | `/api/chats/:id` | Einzelner Chat |
| POST | `/api/chats` | Chat erstellen |
| PATCH | `/api/chats/:id` | Chat aktualisieren |
| DELETE | `/api/chats/:id` | Chat löschen |
| DELETE | `/api/chats` | Alle Chats löschen |

### Tokens
| Method | URL | Beschreibung |
|--------|-----|--------------|
| GET | `/api/balance` | Guthaben abrufen |
| POST | `/api/consume` | Tokens verbrauchen |
| GET | `/api/transactions` | Transaktionen |

### Zahlungen
| Method | URL | Beschreibung |
|--------|-----|--------------|
| POST | `/api/payment/stripe/create-intent` | Stripe starten |
| POST | `/api/payment/stripe/webhook` | Stripe Webhook |
| POST | `/api/payment/paypal/create-order` | PayPal Order |
| POST | `/api/payment/paypal/capture-order` | PayPal bestätigen |

---

## Auf Render deployen

1. Neues **Web Service** auf render.com
2. GitHub Repo verbinden (nur `st-backend` Ordner)
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. Alle Environment Variables aus `.env` bei Render eintragen

## Frontend einbinden

In deiner `app.html` und `index-mobile.html` oben einfügen:
```js
const API = 'https://DEIN-BACKEND.onrender.com';
let authToken = localStorage.getItem('st_token');

async function apiCall(path, method='GET', body=null) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: 'Bearer ' + authToken } : {})
    },
    body: body ? JSON.stringify(body) : null
  });
  return res.json();
}
```
