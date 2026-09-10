# Rihaish — Housing Society Management System (Prototype)

A working full-stack prototype of a housing society management platform for the Pakistani market.

- **Residents** interact **only via WhatsApp** — simulated end-to-end with an in-browser
  WhatsApp Simulator (no real WhatsApp account needed).
- **Admins / committee** use a web dashboard (billing, visitors, complaints kanban,
  announcements, reports, documents, audit log, English/Urdu toggle).
- **Guards** use a simplified mobile-friendly web view with QR pass scanning.

All external integrations (Meta WhatsApp Cloud API, EasyPaisa, JazzCash) are **mocked behind
clean provider interfaces** so real credentials can be swapped in later without touching
business logic.

## Tech stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React (Vite) + TypeScript + Tailwind CSS (`/client`) |
| Backend   | Node.js + Express + TypeScript (`/server`) |
| Database  | PostgreSQL via Docker Compose, Prisma ORM |
| Auth      | JWT (bcrypt-hashed passwords), role-based (ADMIN / TREASURER / GUARD) |
| Realtime  | Polling (simulator & inbox poll every 1.5–5s) |
| QR codes  | Real generation via `qrcode`; scanning via `jsqr` + `getUserMedia` |

## Quick start — everything on Docker (one command)

```bash
docker compose up -d --build
```

That's the whole demo: Postgres + API + web app. The API pushes the schema and seeds
demo data automatically on first start.

- App: **http://localhost:5173** (dashboard login)
- WhatsApp Simulator: **http://localhost:5173/whatsapp-simulator**
- API: http://localhost:4000/api/health

To force-reset the demo data: `docker compose exec api npx tsx prisma/seed.ts`
(or `docker compose down -v && docker compose up -d --build` for a fully clean slate).

## Quick start — local dev (hot reload)

Prerequisites: Node 18+, Docker (for the database only).

```bash
# 1. Database
docker compose up -d db       # Postgres on localhost:5433 (user/pass/db: hsms)

# 2. Server
cd server
cp .env.example .env          # defaults work out of the box
npm install
npm run db:push               # create schema
npm run seed                  # load demo data
npm run dev                   # API on http://localhost:4000

# 3. Client (new terminal)
cd client
npm install
npm run dev                   # app on http://localhost:5173
```

Optional: `docker compose --profile tools up -d` also starts pgAdmin on
http://localhost:5050 (admin@demo.pk / admin123).

## Demo credentials & data

| Role      | Email             | Password     |
|-----------|-------------------|--------------|
| Admin (super, multi-society) | `admin@demo.pk` | `admin123` |
| Treasurer (Gulshan Green Valley) | `treasurer@demo.pk` | `treasurer123` |
| Guard     | `guard@demo.pk`   | `guard123`   |

Seeded: 2 societies (Gulshan Green Valley – Karachi, Model Town Residency – Lahore),
20 residents/plots, 3 months of bills, visitors with QR passes, complaints, announcements.

**WhatsApp Simulator** (http://localhost:5173/whatsapp-simulator — no login needed):

- `923001112222` — Ahmed Raza (plot A-101), **already linked**: type `menu` and go.
- Any **new** number — walks the registration flow: send a plot number
  (e.g. `A-102`), then the CNIC last-4 shown in the simulator's hint panel.

## Demo walkthrough (acceptance flow)

1. Open the simulator as `923001112222` → `menu` → **Request Visitor Pass** → name → date.
2. In the dashboard (admin) → **Visitors** → approve the pending request.
3. The **QR pass appears in the WhatsApp chat**.
4. Log in as guard (`/guard`, mobile-friendly) → scan the QR (or type the `GP-…` code) →
   **Entry Logged** → pass becomes USED, shows in today's log.
5. In the simulator: **Submit Complaint** → pick category → describe → get a ticket ID.
6. Dashboard → **Complaints** kanban → move it to Resolved → the status update
   **pushes back into the WhatsApp chat**.
7. **Billing** → send a WhatsApp reminder → tap **Pay** in the chat → mock payment settles
   after ~1.5s → bill turns PAID.
8. Every step above is recorded in **Audit Log**.

## Project layout

```
docker-compose.yml         Postgres (+ optional pgAdmin)
server/
  prisma/schema.prisma     Data model (Society, User, Resident, Plot, Bill, Payment,
                           Visitor, VisitorPass, Complaint, ComplaintUpdate, Announcement,
                           AnnouncementAck, Document, AuditLog, WaConversation, WaMessage)
  prisma/seed.ts           Demo data (npm run seed — re-runnable)
  src/integrations/
    whatsapp/              WhatsAppProvider interface
                           ├─ MockWhatsAppProvider (default, drives the simulator)
                           └─ MetaWhatsAppProvider (stub, documents Meta Cloud API calls)
    payments/              PaymentProvider interface
                           ├─ MockPaymentProvider (default, delayed settle)
                           ├─ EasyPaisaProvider (stub + integration outline)
                           └─ JazzCashProvider (stub + integration outline)
    qrcode/                Real QR generation (qrcode npm lib)
  src/whatsapp/
    flowEngine.ts          Conversational state machine (registration, menu, visitor,
                           bill/pay, complaint, announcements, escalation)
    notifications.ts       Outbound pushes (pass approval, complaint updates, broadcasts)
  src/routes/              REST API (auth, societies, plots, residents, bills, visitors,
                           guard, complaints, announcements, documents, reports, audit,
                           whatsapp webhook + simulator + admin inbox)
client/
  src/pages/               Dashboard, Society, Billing, Visitors, Complaints (kanban),
                           Announcements, Inbox, Documents, AuditLog, Guard, WhatsAppSimulator
  src/i18n/                en.json / ur.json (English/Urdu toggle in the header)
```

## Swapping mocks for real providers

**WhatsApp (Meta Cloud API)**

1. Set in `server/.env`: `WHATSAPP_PROVIDER=meta`, plus `META_WHATSAPP_TOKEN`,
   `META_PHONE_NUMBER_ID`, `META_WEBHOOK_VERIFY_TOKEN`.
2. Implement `MetaWhatsAppProvider.sendMessage()` — the exact Cloud API calls
   (text, interactive buttons/list, media upload, templates) are documented in the class.
3. Point Meta's webhook at `GET/POST /api/whatsapp/webhook`. The GET verification handshake
   is already wired; in the POST handler, normalize Meta's `entry[].changes[].value.messages[]`
   into the existing `InboundWaEvent` shape (`{from, type, text?, buttonId?}`).
   **The flow engine and all business logic stay untouched** — the simulator already posts
   this exact shape.

**Payments (EasyPaisa / JazzCash)**

1. Set `PAYMENT_PROVIDER=easypaisa` (or `jazzcash`) plus the env vars listed in `.env.example`.
2. Implement `initiatePayment()` in the corresponding provider class — the request/hash/status
   flow for each gateway is outlined in the class comments.
3. Callers (`flowEngine.handleBillPayment`) only see the `PaymentProvider` interface.

**Documents → S3**: replace the multer disk storage in `server/src/routes/documents.ts`
(marked `S3 SWAP-IN POINT`).

## Notes / prototype limitations

- The simulator uses polling rather than websockets — swap-friendly, zero extra infra.
- Urdu translations are basic; layout stays LTR even in Urdu mode.
- `GET /api/whatsapp/demo-residents` exposes seeded hint data for the simulator page —
  remove before anything real.
- No production hardening (rate limiting, refresh tokens, CSRF) — out of scope per spec.
