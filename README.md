# AI Kundtjänst – Premium Edition

En avancerad AI-baserad kundtjänst byggd med Node.js, lik stora AI-chattar.

## Funktioner
- Modern, responsiv och tillgänglig UI/UX
- Realtidswidgets (SLA, notifieringar, KPI)
- Microinteractions och premium-dialoger
- Avancerad adminpanel och rollhantering
- Robust backend med JWT, MongoDB, OpenAI
- Autoskroll, toast/alert, onboarding

## Kom igång
1. Klona repot och installera:
   ```bash
   git clone <repo-url>
   cd ai-kundtjanst
   npm install
   ```
2. Skapa en `.env`-fil med:
   ```env
   MONGO_URI=din_mongodb_uri
   JWT_SECRET=din_jwt_secret
   OPENAI_API_KEY=din_openai_key
   SMTP_HOST=smtp.exempel.se
   SMTP_USER=din_email
   SMTP_PASS=din_epost_losen
   APP_URL=http://localhost:3000
   ```
3. Starta servern:
   ```bash
   node Server.js
   ```
4. Öppna `index.html` i webbläsaren.

## Roller
- **User:** Chatta, se egna ärenden
- **Agent:** Hantera tickets, inbox, SLA
- **Admin:** Full tillgång, export, kategori, användare

## Premium Widgets
- SLA-status och notifieringar i sidebar
- Autoskroll och microinteractions
- Custom dialoger och alerts

## Utbyggnad
- Lägg till egna widgets i `sidebarWidgets`
- Anpassa dialoger och toast i `script.js` och `style.css`

## Felsökning
- Kontrollera att alla env-variabler är korrekta
- Se debug-panelen i sidomenyn
- Loggar skrivs ut i terminalen

## Support
- Kontakta systemägare eller admin för hjälp

---
Premium Edition © 2026