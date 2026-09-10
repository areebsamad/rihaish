# Build Prototype: Housing Society Management System

Build a working full-stack prototype of a housing society management platform (inspired by Hamari Society, hamarisociety.pk) for the Pakistani market. Residents interact **only via WhatsApp** (no resident app/login). Admins/committee use a web dashboard. Guards use a simplified web interface.

Since this is a prototype, do not wait for real WhatsApp Business API (Meta) or payment gateway (EasyPaisa/JazzCash) credentials. Build against **mock/simulated providers behind clean interfaces**, so real credentials can be swapped in later without touching business logic. Include a simple in-browser "WhatsApp Simulator" chat widget so the WhatsApp resident flows are demoable end-to-end without a real WhatsApp account.

## Tech Stack (decided — do not ask, just use)

- **Frontend**: React (Vite) \+ TypeScript \+ Tailwind CSS  
- **Backend**: Node.js \+ Express \+ TypeScript  
- **Database**: PostgreSQL (via Docker Compose); use Prisma as ORM  
- **Auth**: JWT-based auth for admin/committee/guard web logins  
- **Realtime**: Socket.io or polling for the WhatsApp simulator and visitor/guard updates  
- **Monorepo layout**: `/client` (React app), `/server` (Express API), `/docker-compose.yml`  
- Seed the database with realistic fake data (2 sample societies, \~20 residents/plots, sample bills, visitors, complaints).

## Architecture Requirements

- `/server/src/integrations/whatsapp/` — a `WhatsAppProvider` interface with:  
  - `MockWhatsAppProvider` (default, drives the in-app simulator via websockets/DB)  
  - A stubbed `MetaWhatsAppProvider` class documenting exactly which Meta Cloud API calls it will make (send template message, send interactive list/buttons, receive webhook) — not functional, just scaffolded with TODOs and env vars expected.  
- `/server/src/integrations/payments/` — a `PaymentProvider` interface with:  
  - `MockPaymentProvider` (simulates a successful/failed payment after a delay)  
  - Stubbed `EasyPaisaProvider` and `JazzCashProvider` classes with TODOs and required env vars documented.  
- `/server/src/integrations/qrcode/` — real QR code generation (use a real npm library like `qrcode`, this doesn't need to be mocked).

## Data Model (Prisma schema)

Entities: `Society`, `User` (admin/treasurer/guard, role-based), `Resident`, `Plot`, `Bill`, `Payment`, `Visitor`, `VisitorPass`, `Complaint`, `ComplaintUpdate`, `Announcement`, `AnnouncementAck`, `Document`, `AuditLog`.

Key relationships:

- A `Society` has many `Plots`, `Users`, `Residents`, `Announcements`.  
- A `Plot` belongs to a `Resident` (owner/tenant) and has many `Bills`.  
- A `Bill` has many `Payments`; status enum: `PENDING | PAID | OVERDUE`.  
- A `Visitor` request generates a `VisitorPass` with a QR code, status enum: `PENDING | APPROVED | REJECTED | USED | EXPIRED`.  
- A `Complaint` has status enum: `OPEN | IN_PROGRESS | RESOLVED | CLOSED` and a timeline of `ComplaintUpdate`.  
- Every mutating action writes an `AuditLog` entry (actor, action, entity, timestamp, before/after).

## Modules to Build

### 1\. Admin/Committee Web Dashboard (React)

- Login (JWT), role-based navigation (Admin, Treasurer, Guard sees only Guard Interface).  
- **Society & Resident Management**: CRUD for societies, plots, residents; multi-society switcher for super-admin.  
- **Billing & Payments**: generate monthly bills per plot (manual trigger \+ "simulate monthly run"), list with filters (paid/due/overdue), record/view payments, trigger WhatsApp reminder (mocked) per bill.  
- **Visitor Management**: list of visitor requests, approve/reject, view QR passes, full visitor log with search/filter by date/plot.  
- **Complaints/Tickets**: kanban-style board (Open → In Progress → Resolved → Closed), assign to staff, add updates/comments, view WhatsApp-submitted complaints.  
- **Communication**: compose and broadcast announcements (target: all / specific plots), view acknowledgment stats.  
- **Reports & Analytics**: dashboard cards (collection rate, overdue amount, open complaints, visitors today) \+ charts; export table data to CSV/Excel and PDF.  
- **Audit Log viewer**: searchable, filterable table.  
- **Language toggle**: English/Urdu (i18n scaffold with at least these two locales; UI strings externalized to translation files even if Urdu translations are placeholder).

### 2\. WhatsApp Resident Interface (simulated)

Build a `/whatsapp-simulator` page in the client that renders a phone-style chat UI. It talks to the backend exactly the way a real webhook would (same endpoint shapes), so swapping in Meta's API later only requires replacing the provider, not the flow logic.

Implement these conversational flows as structured state machines (not free-text AI), matching how WhatsApp interactive buttons/lists work:

- **Registration/enquiry**: new number → ask for plot number/CNIC last 4 digits → verify against resident DB → link WhatsApp number to resident.  
- **Main menu** (button list): View Bill, Pay Bill, Request Visitor Pass, Submit Complaint, Announcements, Talk to Admin (human escalation flag).  
- **Visitor request flow**: ask visitor name \+ expected date/time → creates `Visitor` \+ `VisitorPass` (pending) → on admin approval, sends a message back with the QR code image.  
- **Bill flow**: show current bill status/amount → "Pay Now" triggers `PaymentProvider` (mock) → confirmation message.  
- **Complaint flow**: category (list) → free-text description → creates `Complaint`, replies with ticket ID; status updates pushed back as simulated messages.  
- **Announcements**: broadcasts appear in the simulator as incoming messages with an "Acknowledge" button; tapping it records `AnnouncementAck`.  
- **Human escalation**: a button/keyword ("talk to admin") flags the conversation for a human; flagged conversations appear in a small "Inbox" tab in the admin dashboard.

### 3\. Guard Interface (simplified web view, mobile-friendly)

- Login (Guard role).  
- QR scan screen (use device camera via browser `getUserMedia` \+ a JS QR-scanning lib) or manual code entry fallback.  
- On scan: look up `VisitorPass`, show visitor name/plot/status, button to mark "Entry Logged" / "Exit Logged".  
- Simple log list of today's entries/exits.

### 4\. Other Features

- Document storage: upload/list/download documents per society (store files locally on disk for prototype; note S3 swap-in point in code comments).  
- Audit logs: already covered above.  
- Bilingual support: already covered above.

## Non-Functional / Prototype Setup

- `docker-compose.yml` spinning up Postgres (+ optionally pgAdmin).  
- `.env.example` files for both client and server listing all required variables, including placeholders for `META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID`, `EASYPAISA_*`, `JAZZCASH_*` (unused by mocks but documented for the real swap-in).  
- Seed script (`npm run seed`) populating demo data so the app is immediately explorable.  
- `README.md` with: setup steps, how to run (`docker compose up`, `npm run dev` for client/server), demo login credentials for Admin/Treasurer/Guard, and a short "how to swap mocks for real WhatsApp/payment providers" section.  
- Basic input validation and error handling on all API routes; no need for production-grade security hardening, but hash passwords (bcrypt) and use JWT properly.  
- Keep the code organized and commented well enough that a developer can later swap in real integrations without re-architecting.

## Explicitly Out of Scope for This Prototype

- Real Meta WhatsApp Business API calls (build the interface/scaffold only, per above).  
- Real payment gateway transactions.  
- Production deployment/hosting setup, CI/CD, load testing.  
- Native mobile apps (project intentionally has none).

## Suggested Build Order (for Claude Code to follow)

1. Scaffold monorepo (`/client`, `/server`), Docker Compose, Prisma schema \+ migrations.  
2. Seed script with demo data.  
3. Auth (login/JWT) \+ role-based middleware.  
4. Resident/Plot/Society CRUD (admin dashboard).  
5. Billing module \+ mock payment provider.  
6. Visitor management \+ QR generation \+ Guard interface.  
7. Complaints module.  
8. Announcements \+ acknowledgments.  
9. WhatsApp simulator UI \+ conversational state machine wired to the modules above.  
10. Reports/analytics dashboard \+ CSV/PDF export.  
11. Audit log \+ i18n scaffold.  
12. README \+ `.env.example` \+ final pass/cleanup.

## Acceptance Criteria for "Working Prototype"

- `docker compose up` \+ `npm run dev` (client & server) \+ `npm run seed` gets a fully browsable app with no manual DB setup.  
- Can log in as Admin, see seeded residents/bills/visitors/complaints.  
- Can open the WhatsApp simulator as a seeded resident, request a visitor pass, have it approved in the admin dashboard, and see the QR code appear back in the chat.  
- Can log in as Guard, scan/enter that QR code, and see it marked as used.  
- Can submit a complaint via the simulator and see it appear on the admin kanban board, then resolve it and see the status update reflected back in the simulator.  
- Every action above produces a corresponding audit log entry.

