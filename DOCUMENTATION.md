# Billing Agent — System Documentation

A hosted, multi-entity **billing and accounts-receivable** system for YAHSHUA‑ABBA
(an accounting/payroll firm in the Philippines). It turns **contracts** into
VAT/withholding‑compliant **invoices**, routes them through an **approval workflow**,
emails the branded PDF, tracks payment (manually or online via **HitPay**), chases
overdue accounts with **tiered follow‑ups**, **automates** recurring billing on a daily
schedule, and answers questions about the book through a built‑in **AI assistant**.

- **Live app:** _your Vercel production URL for project `billing-agent`_
- **Repo:** https://github.com/MixchieDev/billing-agent
- **Deploy target:** Vercel (functions pinned to Mumbai `bom1`) + Supabase Postgres — see §19.

---

## 1. What it does, in one paragraph

You keep a list of **contracts** (each a client's recurring service, priced monthly and
tied to a **billing entity** — *YOWI* or *ABBA*). Invoices are created from those contracts —
automatically on a **daily scheduler**, in bulk, or one‑off in the **Invoice Generator** — and
land in **Pending**. An **approver** reviews and **approves** (or **rejects**) them; approved
invoices are **sent** as a branded PDF by email, optionally with a **"Pay online"** HitPay
link. When money arrives you **mark them paid** (or HitPay's webhook does it for you), and
unpaid ones can be escalated through **three levels of follow‑up email**. Everything a user
does is **audit‑logged**, key events raise **notifications**, and paid invoices **export to
YTO** (YAHSHUA Tax Online) for accounting. A separate **RCBC module** produces one consolidated
invoice per month from a roster of end‑clients billed by headcount.

---

## 2. Architecture & tech

- **App:** **Next.js 16** (App Router, React 19, Server Components + a REST API under
  `/api/*`), one deployment on **Vercel**. UI and server logic live in the same project.
- **Database:** **PostgreSQL** (Supabase) accessed through **Prisma**, via Supabase's
  **PgBouncer** transaction pooler. Functions run in **Mumbai (`bom1`)** to sit next to the
  `ap-south-1` database (this is a deliberate latency fix — see §19).
- **Auth:** **NextAuth v4**, Credentials provider (email + password, bcrypt‑hashed), **JWT**
  session strategy. The user's **id** and **role** ride inside the token.
- **Email:** **nodemailer** over SMTP (Google Workspace, `billingcollection@abba.works`).
  Every send is written to an `EmailLog`.
- **PDF:** generated server‑side (`pdfkit` / `pdf-lib`) from a **per‑entity template**
  (colours, logo, footer, bank details).
- **Payments:** **HitPay** hosted checkout + webhook (QR Ph, GCash, card, GrabPay, Maya).
- **AI assistant:** **Anthropic Claude** (`@anthropic-ai/sdk`, model
  `claude-sonnet-4-20250514`) with a set of read‑only database "tools" (§16).
- **Scheduling:** a **Vercel Cron** hits `/api/scheduler/trigger` once a day (§9).

---

## 3. Core concepts

- **Billing entity (`Company`):** the legal entity that *issues* the invoice — e.g. **YOWI**
  or **ABBA**. Each has its own **invoice numbering** (`invoicePrefix` + `nextInvoiceNo`),
  **contract numbering**, **bank details**, **TIN**, logo, and a **branding template**.
- **Partner:** an optional **billing intermediary** an invoice is addressed through. Carries
  its own *Invoice To* / *Attention* / address / email(s) and can pin a custom **email
  template**. Its **billing model** shapes how the invoice is addressed and consolidated:
  - **DIRECT** — billed straight to the client (the default).
  - **GLOBE_INNOVE** — consolidated/addressed via the Globe–Innove arrangement.
  - **RCBC_CONSOLIDATED** — consolidated via RCBC (see the RCBC module, §10).
- **Contract:** a client's **recurring service agreement** — `monthlyFee`, `productType`
  (Accounting / Payroll / Compliance / HR …), its **billing entity** and optional **partner**,
  tax treatment (`vatType`, withholding), and automation switches **`autoApprove`** and
  **`autoSendEnabled`** plus a **`billingDayOfMonth`**. Contracts get an auto‑assigned
  **customer number** per entity.
- **Invoice:** one bill, with a **status lifecycle** (§6): `PENDING → APPROVED → SENT → PAID`,
  with side exits `REJECTED` and `VOID`. Carries the tax breakdown (service fee, VAT,
  withholding, net), line items, email/follow‑up logs, and payment details.
- **Roles are global** (not per‑entity): **ADMIN**, **APPROVER**, **VIEWER** (§8).
- **Scheduled billing:** a per‑contract recurring rule that the daily cron turns into invoices
  (§9). Rules are themselves **approved** before they go live.
- **Tax model (Philippines):** VAT (default **12%**) is added for VAT clients; **withholding
  tax (EWT)** is deducted to give the **net receivable** (§11).

---

## 4. Getting started (first time)

1. An **ADMIN** opens **Users** → **Create User** and gives you an email, a password, and a
   **role**. (There is **no open sign‑up** — see §8.)
2. Sign in at **/login**.
3. **Configure the entities** (ADMIN → **Settings**): branding template, bank details,
   invoice prefix/next number, tax rates and withholding presets, product types, and the
   billing/follow‑up email templates (§15).
4. Add **Partners** (if you bill through intermediaries) and **Contracts** (or import them by
   CSV, §14).
5. Create invoices — via the **Invoice Generator**, a **Scheduled Billing** rule (§9), or the
   dashboard's **Run Billing** — then **approve → send → mark paid** (§6, §7).

---

## 5. Screen‑by‑screen reference (every control)

> Navigation is a left **sidebar**; a **top header** on every page carries the page title, a
> global **invoice search**, the **notifications** bell, and the user menu. Screenshots can be
> dropped into `docs/screenshots/` later.

### 5.1 Sign in
`/login` — Email + Password fields, **Sign In** (shows "Signing in…"), red error box on
failure. No self‑registration.

### 5.2 Sidebar (left nav)
Header shows **YAHSHUA‑ABBA · Billing Agent** with a collapse/expand toggle. Items:

| Item | Route | Visible to |
|---|---|---|
| **Dashboard** | `/dashboard` | all |
| **Pending Approval** | `/dashboard/pending` | all |
| **Approved** | `/dashboard/approved` | all |
| **Rejected** | `/dashboard/rejected` | all |
| **All Invoices** | `/dashboard/invoices` | all |
| **Paid Invoices** | `/dashboard/paid` | all |
| **Contracts** | `/dashboard/contracts` | all |
| **Scheduled Billings** | `/dashboard/scheduled` | all |
| **Invoice Generator** | `/dashboard/generate-invoice` | all |
| **RCBC** | `/dashboard/rcbc` | all |
| **Partners** | `/dashboard/partners` | all |
| **Settings** | `/settings` | all (writes are ADMIN‑gated) |
| **Users** | `/dashboard/users` | **ADMIN only** |
| **Audit Logs** | `/dashboard/audit-logs` | **ADMIN only** |
| **Sign Out** | — | all |

The **Users** and **Audit Logs** links are hidden unless `role === 'ADMIN'`.

### 5.3 Dashboard (`/dashboard`)
The workflow overview. **Stat cards** — Pending (count + amount), Approved (count + amount),
Rejected, Sent. **Refresh** and **Run Billing** (triggers a billing run; confirmation
required). **Filters:** Billing Entity (All / YOWI / ABBA), Product Type, Status, **Clear**.
**Invoice table** (sortable) with select‑checkboxes and per‑row actions (Approve, Reject, Void,
Edit, View PDF, Send). **Bulk bar** when rows are selected: **Bulk Approve**, **Clear
Selection**.

### 5.4 Invoice lists — Pending / Approved / Rejected / All Invoices
Same layout, scoped to a status (All Invoices spans every status and adds a **Status** filter).
**Search** (client name or billing no — server‑side, spans all pages), **Entity** filter,
**Refresh**, and **pagination** (50/page). Per‑row actions depend on status: **Approve /
Reject** (pending), **Send**, **Mark Paid**, **View PDF**, **Edit**, **View History**,
**Follow‑up Email**, **Void**. Modals: *Mark Paid*, *Send Invoice*, *Invoice Edit*, *Invoice
Audit Log*.

### 5.5 Paid Invoices (`/dashboard/paid`)
**Toggle Filters**, **Refresh**, **Export to YTO** (downloads a CSV for the accounting system).
**Filters:** Payment Date From / To, **Clear**. **Summary cards:** Paid count, Total Invoice
Amount, Total Amount Received. **Table:** Invoice No, Client, Amount, Due Date, Paid Date,
Amount Paid, Payment Method, Reference, Entity.

### 5.6 Contracts (`/dashboard/contracts`)
**Search**, **Status / Billing Entity / Product Type** filters, **Refresh**, **CSV Import**,
**Create Contract**, pagination. **Table:** Customer No, Company Name, Product Type, Monthly
Fee, Status, Next Due Date, Billing Entity, Contact, Email, Payment Plan, **Auto‑Send** toggle,
Actions (Settings, Delete). Modals: *Contract Form* (create/edit), *CSV Import*, *Contract
Settings* (auto‑send + end date), *Delete confirm*.

### 5.7 Partners (`/dashboard/partners`)
Card grid, one card per partner: **code**, name, **Edit**. Fields (editable inline): Company,
*Invoice To*, Attention, Address, Email, Additional Emails (comma‑separated), **Billing Model**,
**Email Template**. **Save / Cancel**.

### 5.8 Scheduled Billings (`/dashboard/scheduled`)
Three tabs (see §9 for behaviour):
- **Create Schedule** — Contract, Billing Entity, Amount, Description, **Frequency**
  (Monthly / Quarterly / Annually / Custom), **Billing Day of Month**, Start/End date,
  **Auto‑Approve**, **Auto‑Send**, VAT Type, Withholding (rate/code), Remarks → **Create**.
- **Manage Schedules** — table (Company, Product, Amount, Frequency, Next Billing Date,
  **Status** badge) with **Approve / Reject / Pause / Resume / Run‑Now / Delete**.
- **Run History** — past runs with date‑range + status filters (Date, Action, Status, Details).

### 5.9 Invoice Generator (`/dashboard/generate-invoice`)
Create an ad‑hoc invoice: pick a **Contract** (or tick **Use custom bill‑to** and type
Company/Attention/Address/Email/TIN), **Billing Entity**, **Monthly Rate**, **Description**,
**Due Date**, **VAT Type**, **Withholding** (rate + code), **Auto‑Approve**, **Send
Immediately**, Remarks. A **billing period** block (payment plan + start/end month, per‑period
discounts) and optional **custom line items** (description, amount, discount). **Preview** (PDF)
and **Generate**.

### 5.10 RCBC (`/dashboard/rcbc`) — see §10
- **Master Data** — Month selector; **Refresh / CSV Import / Create Client**; table of
  end‑clients (Name, Employee Count, Rate/Employee, Active, Edit/Delete).
- **Billing Summary** — Month selector; cards (Total Clients, Total Employees, Service Fee,
  VAT, Gross, Withholding, **Net**); **Generate Invoice** (creates the consolidated invoice).

### 5.11 Users (`/dashboard/users`) — ADMIN only
**Create User**; table (Name, Email, **Role** badge, Created); per‑row **Edit**, **Change
Password**, **Delete**. Non‑admins who reach the URL see *"You do not have permission…"*.

### 5.12 Audit Logs (`/dashboard/audit-logs`) — ADMIN only
Filters: Date From/To, **Action**, **Entity Type**, **User**, free‑text **Search**, **Clear**.
Paginated table (Timestamp, Action badge, Entity Type, Entity ID, User, Details, IP). Row →
**Detail** modal with the full JSON.

### 5.13 Settings (`/settings`) — see §15
Tabs: **Invoice Templates** (per entity — colours, title, footer, disclaimer, notes, bank
details, invoice prefix/next number, signatories, live preview), **Companies**, **Tax** (VAT
rate + withholding presets), **Product Types**, **Scheduler**, **Email Templates**, **Follow‑up
Emails** (3 levels + placeholder list).

### 5.14 Shared modals
*Send Invoice* (recipient email(s), template, Send), *Mark Paid* (amount, method
CASH/BANK_TRANSFER/CHECK, reference, paid date), *Invoice Edit* (recipient fields + line items,
**Sync from Partner**), *Invoice Audit Log*, *Contract Form / Settings*, *CSV Import*
(download template → validate → import), *User Form*, *Change Password*, *RCBC Client Form*,
*Delete confirm*.

---

## 6. The invoice lifecycle

`InvoiceStatus` = **PENDING · APPROVED · REJECTED · SENT · PAID · CANCELLED · VOID**.

| To → | From | Action / endpoint | What it does |
|---|---|---|---|
| **PENDING** | (new) | generated from a contract, the scheduler, or `POST /api/invoices/generate` | Computes tax, assigns billing no, creates line items. Starts **APPROVED** instead if the contract/rule has `autoApprove`. |
| **APPROVED** | PENDING | `POST /api/invoices/[id]/approve` (or `…/bulk-approve`) | Stamps `approvedBy/approvedAt`; audit + notification. No email yet. |
| **REJECTED** | PENDING | `POST /api/invoices/[id]/reject` `{reason, rescheduleDate?}` | Records reason; audit + notification. Not resendable — rework needed. |
| **SENT** | APPROVED (or re‑send from SENT) | `POST /api/invoices/[id]/send` | **Generates the PDF**, resolves recipient(s) + email template, optionally creates a **HitPay** link, attaches any uploaded files, emails it, logs `EmailLog`, sets **SENT**. |
| **PAID** | SENT | `POST /api/invoices/[id]/mark-paid` **or** the HitPay webhook | Records amount, method (`CASH/BANK_TRANSFER/CHECK/HITPAY`), reference, paid date; audit + notification. |
| **VOID** | APPROVED only | `POST /api/invoices/[id]/void` `{reason}` | Archives an approved‑but‑not‑sent invoice. |
| **CANCELLED** | — | (not exposed in the UI) | Reserved/legacy state. |

Other invoice actions: **Follow‑up** (§12), **Toggle follow‑up** on/off, **Sync from Partner**
(pull recipient fields off the partner — *ADMIN*), **Edit** recipient/line items while
PENDING/APPROVED (*ADMIN*), **Attachments** (≤5 files, ≤5 MB each, auto‑attached on send),
**PDF** (`GET …/pdf`), **Export to YTO** (`GET /api/invoices/export`).

---

## 7. Standard workflow & best‑practice playbook

1. **Create invoices.** Let the **scheduler** do it (§9), click **Run Billing** on the
   dashboard, or use the **Invoice Generator** for one‑offs.
2. **Review Pending.** On **Pending Approval**, open the PDF, then **Approve** (or **Reject**
   with a reason). Approve in bulk with the checkboxes + **Bulk Approve**.
3. **Send.** From **Approved**, **Send** the invoice. Tick a payment link if you want the
   client to pay online. Uploaded **attachments** ride along automatically.
4. **Collect.** When paid, **Mark Paid** with the amount/method/reference — or let the **HitPay
   webhook** flip it to PAID on its own.
5. **Chase.** For overdue **SENT** invoices, send a **Follow‑up** (Level 1 → 2 → 3). Turn
   follow‑ups off per invoice with the toggle.
6. **Reconcile.** On **Paid Invoices**, filter by payment date and **Export to YTO**.

### 7a. First‑time setup (once)
Configure both entities in **Settings** (branding, bank details, invoice numbering, tax
presets, product types, email + follow‑up templates), add **Partners**, then **Contracts**
(bulk via CSV). Decide per contract whether to **auto‑approve** and **auto‑send**.

### 7b. Recurring‑billing hygiene
- Put contracts on **Scheduled Billing** with the right **billing day** and **frequency**; the
  cron handles the rest and **won't double‑bill a period** (§9).
- Reserve **auto‑approve** for trusted, stable contracts — otherwise keep the human approve
  step.
- Keep recipient details on the **Partner** and use **Sync from Partner** so a change updates
  invoices without re‑typing.

### 7c. Access hygiene
- Give day‑to‑day staff **VIEWER**; give reviewers **APPROVER**; keep **ADMIN** for setup,
  users, and settings (§8).
- Everything is **audit‑logged** — use **Audit Logs** to see who approved/sent/voided what.

---

## 8. Roles & access control

Three **global** roles. Enforcement is **per‑route** in the API (each handler re‑checks
`getServerSession` and the role) — there is **no middleware**. The sidebar hides admin‑only
links, and the role/id travel inside the **JWT**.

| Capability | ADMIN | APPROVER | VIEWER |
|---|:---:|:---:|:---:|
| Sign in; view dashboards, invoices, contracts, partners, paid, PDFs, export | ✅ | ✅ | ✅ |
| **Approve / Reject / Void** invoices; **Bulk Approve** | ✅ | ✅ | ❌ |
| **Send** invoices; **Mark Paid**; **Follow‑up** + toggle | ✅ | ✅ | ❌ |
| Upload / delete invoice **attachments** | ✅ | ✅ | ❌ |
| Approve / reject **scheduled‑billing** rules | ✅ | ✅ | ❌ |
| **Sync from Partner**; **edit** invoice fields (PUT) | ✅ | ❌ | ❌ |
| **Settings**, **Email Templates** | ✅ | ❌ | ❌ |
| **Users** (create/edit/delete, reset passwords) | ✅ | ❌ | ❌ |
| **Audit Logs** | ✅ | ❌ | ❌ |

Typical gate in a write route:

```ts
const session = await getServerSession(authOptions);
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
if (session.user.role !== 'ADMIN' && session.user.role !== 'APPROVER')
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
```

**Honest notes on enforcement:**
- **Read endpoints** (`GET` lists/detail, PDF, export) check only that you're **signed in** —
  they don't gate by role, so VIEWER can read broadly (by design).
- **Approval/admin/destructive** actions are the ones hard‑gated on the server; a few
  create/update paths lean on the **UI** to hide the control rather than a strict server role
  check. Treat the table above as the enforced spine, not a byte‑for‑byte guarantee for every
  create path.
- **Users are created by ADMIN only** — there is no public sign‑up. Passwords are bcrypt‑hashed
  (12 rounds); an admin can reset another user's password without the old one.

---

## 9. Scheduled billing & the daily cron

**Create a rule** (`POST /api/scheduled-billings`) tied to a contract: amount, **frequency**
(MONTHLY / QUARTERLY / ANNUALLY / **CUSTOM** with `customIntervalValue` + `customIntervalUnit`
DAYS/MONTHS), **`billingDayOfMonth`** (and optional `dueDayOfMonth`), start/optional‑end date,
and the **`autoApprove` / `autoSendEnabled`** switches. The rule starts **PENDING**.

**Rule status:** `PENDING → ACTIVE → PAUSED / ENDED`, driven by
`…/approve` (→ ACTIVE), `…/reject` (→ ENDED), `…/pause`, `…/resume`, and `…/run-now` (bill
immediately). Only **ACTIVE** rules are picked up by the cron.

**The daily job** (`GET /api/scheduler/trigger`):
- Fired by **Vercel Cron** from `vercel.json` at **`0 0 * * *` UTC = 8:00 AM Manila**
  (Vercel crons are UTC; Manila is UTC+8). Authenticated by `Authorization: Bearer $CRON_SECRET`
  (an ADMIN session can also trigger it manually).
- Selects ACTIVE rules due **today** (matching `billingDayOfMonth`, within start/end), then for
  each creates the invoice, applying `autoApprove` and — for recurring frequencies —
  `autoSendEnabled` to email it straight away (system action; `userId = null`).
- **Idempotent:** `checkExistingInvoiceForPeriod` skips a rule already billed for the current
  period (month / quarter / year), so a re‑run or a manual **Run Billing** **won't
  double‑bill**. Each attempt is recorded as a **`ScheduledBillingRun`**
  (SUCCESS / FAILED / SKIPPED, with the linked invoice).

> **Plan note:** on Vercel **Hobby**, crons fire only *approximately* (within the hour) and
> cron analytics are a Pro feature. For exact timing, use an external scheduler that calls
> `/api/scheduler/trigger` with the `CRON_SECRET`.

---

## 10. The RCBC consolidated module

For the **RCBC** (Rizal Commercial Banking Corporation) arrangement, one **consolidated
invoice per month** is billed by **headcount** across many **end‑clients**.

- **Roster (`RcbcEndClient`):** `name`, `employeeCount`, `ratePerEmployee`, `month`
  (stored `YYYY‑MM‑01`), `isActive`. Maintain it on **RCBC → Master Data** (Create Client, or
  **CSV Import** — columns `name, employeeCount, ratePerEmployee, month[, isActive]`, upserted
  by `name+month`).
- **Summary:** **RCBC → Billing Summary** aggregates the month — total clients, total
  employees, and the service fee / VAT / gross / withholding / **net** roll‑up (each end‑client
  contributes `employeeCount × ratePerEmployee`).
- **Generate:** **Generate Invoice** (`POST /api/rcbc/generate-invoice`) creates a single
  invoice for the month with **one line item per end‑client**, which then flows through the
  normal approve → send → paid lifecycle.

Monthly routine: update the roster → check the summary → generate → approve → send.

---

## 11. Billing math: VAT & withholding tax

Per invoice (and per line item):

- **Service fee** — the base charge.
- **VAT** — added when `vatType = VAT` at the configured rate (**Settings → Tax**, default
  **12%**); `vatType = NON_VAT` adds none.
- **Gross** = service fee + VAT.
- **Withholding tax (EWT)** — deducted when the client withholds, using a **preset** (rate +
  ATC code) from **Settings → Tax**.
- **Net (receivable)** = gross − withholding — the amount you actually expect to collect, and
  the figure the dashboard totals and aging use.

Presets are configurable; each invoice stores its own `vatType`, `vatAmount`, `withholdingRate`,
`withholdingCode`, and the computed `serviceFee / grossAmount / withholdingTax / netAmount`.

---

## 12. Email, PDF & follow‑ups

- **PDF** is regenerated on each send from the entity's **template** (colours, logo, footer,
  bank details, signatories) and the invoice's line items.
- **Email** goes out via **nodemailer/SMTP** from `billingcollection@abba.works` (optional
  BCC). The **subject/greeting/body/closing** come from the invoice's **email template** — the
  partner's pinned template if set, else the default. **Placeholders** are substituted:
  `{{customerName}}`, `{{billingNo}}`, `{{dueDate}}`, `{{totalAmount}}`, `{{periodStart}}`,
  `{{periodEnd}}`, `{{companyName}}`, `{{clientCompanyName}}`, and `{{daysOverdue}}` (follow‑ups).
  Every send writes an **`EmailLog`**.
- **Follow‑ups** (`POST /api/invoices/[id]/follow-up`) apply only to **SENT** invoices and
  **escalate through 3 levels** — **1 Gentle Reminder → 2 Firm Reminder → 3 Final Notice** —
  each with its own template (**Settings → Follow‑up Emails**). The next send is
  `lastFollowUpLevel + 1` (capped at 3), re‑attaches the PDF, writes a **`FollowUpLog`**, and
  bumps `followUpCount / lastFollowUpAt / lastFollowUpLevel`. **Toggle follow‑up** off to stop
  further chasing on a given invoice.

---

## 13. Online payments (HitPay)

- **Create link:** on **Send** (with the payment‑link option) the app calls HitPay, stores a
  `HitpayPaymentRequest` (status PENDING) with the **checkout URL**, and includes *Pay online*
  in the email. Supported methods: **QR Ph, GCash, card, GrabPay, Maya**.
- **Webhook** (`POST /api/webhooks/hitpay`): on a **completed** payment it marks the request
  COMPLETED and flips the **invoice to PAID** (`paymentMethod = HITPAY`, with reference), in a
  single transaction, **idempotently** (a request/invoice already paid is ignored), then raises
  the paid notification.

> **Security note:** the webhook currently **logs but does not block** on signature mismatch —
> tighten this before relying on it in production (§20).

---

## 14. Imports (CSV)

- **Contracts** (`POST /api/import/contracts`, from the Contracts CSV modal): required columns
  `companyName, productType, partner, billingEntity, monthlyFee` (+ optional customerId, status,
  vatType, billingType, contact/email/tin/mobile, remarks, paymentPlan, dates). Runs in two
  modes — **validate** (dry run: to‑create / to‑update / errors / warnings) and **import**
  (upsert, matching by `customerId + billingEntity` or `companyName + productType +
  billingEntity`, assigning customer numbers). Audit‑logged.
- **RCBC end‑clients** (`POST /api/import/rcbc-clients`): `name, employeeCount, ratePerEmployee,
  month[, isActive]`, upserted by `name + month` (§10).

---

## 15. Settings reference

**Settings → …** (writes are **ADMIN**; values are cached ~5 min and the cache clears on save):

- **Invoice Templates** (per entity): primary/secondary/footer colours, invoice title, footer
  text, show‑disclaimer, notes, **bank details**, **invoice prefix + next number**,
  **signatories** (Prepared/Reviewed by), with a live preview.
- **Companies:** name, TIN, address, contact number, logo path.
- **Tax:** VAT rate; **withholding presets** (rate + ATC code + label, with a default).
- **Product Types:** the list offered when creating contracts (value + label).
- **Scheduler:** cron expression, timezone, days‑before‑due (informational; the Vercel cron in
  `vercel.json` is the real trigger — §9).
- **Email:** enable, BCC, reply‑to.
- **Email Templates / Follow‑up Emails:** the billing template and the three follow‑up levels
  (subject/greeting/body/closing) with the placeholder list.

Keys live in the `Settings` table by **category** (`soa`, `scheduler`, `email`, `tax`,
`productTypes`); per‑entity branding lives on `Company` + `InvoiceTemplate`.

---

## 16. The AI assistant

A chat panel (`POST /api/chat`) backed by **Claude** (`claude-sonnet-4-20250514`). It answers
questions about *your* billing data by calling **read‑only tools** and never writes. Ask things
like *"what's overdue for ABBA?"*, *"revenue trend the last 6 months"*, or *"show invoice
S‑2026‑00042"*. Tools available to it:

| Tool | Returns |
|---|---|
| `get_contracts_due_soon` | contracts billing within N days (default 7) |
| `get_contract_details` | one contract by company name |
| `search_contracts` | contracts by name / product type |
| `get_invoice_stats` | dashboard counts + totals |
| `get_pending_invoices` | invoices awaiting approval (optional entity) |
| `get_overdue_invoices` | past‑due unpaid, with days overdue |
| `search_invoices` | invoices by customer / status / entity / date range |
| `get_invoice_details` | full invoice + line items + email/follow‑up logs |
| `get_invoice_activity` | audit + email + follow‑up history for one invoice |
| `get_billing_totals` | revenue by entity and month |
| `get_client_summary` | a client's outstanding / billed / paid + contracts |
| `get_aging_report` | AR aging buckets + collection rate |
| `get_revenue_trends` | month‑over‑month billed / paid / outstanding |

---

## 17. Notifications & audit log

- **Notifications** (`Notification`, bell in the header, polled every 30 s): raised on invoice
  **pending / approved / rejected / sent / paid / overdue / void / follow‑up** and schedule
  **pending / approved / rejected**. A `userId = null` row is a **broadcast** (e.g. all
  approvers on a new pending invoice). Failures to notify never break the main action.
- **Audit log** (`AuditLog`, **ADMIN**‑only page): every meaningful action writes
  `{ userId, action, entityType, entityId, details, ipAddress }` — user CRUD and password
  changes, contract changes, and the full invoice lifecycle (created / approved / rejected /
  sent / auto‑sent / paid / voided / follow‑up / synced). Filter by date, action, entity, or
  user; open a row for the full JSON.

---

## 18. Data model (Postgres / Prisma)

| Table | Purpose | Key fields |
|---|---|---|
| `User` | accounts | email, password (bcrypt), **role** (ADMIN/APPROVER/VIEWER) |
| `Account` · `Session` · `VerificationToken` | NextAuth adapter tables (sessions are JWT) | — |
| `Company` | **billing entity** (YOWI/ABBA) | code, TIN, bank details, `invoicePrefix`, `nextInvoiceNo`, `contractPrefix`, `nextContractNo` |
| `Signatory` | prepared/reviewed‑by names per entity | companyId, role, name, isDefault |
| `InvoiceTemplate` | per‑entity branding | colours, logo, title, footer, showDisclaimer |
| `Partner` | billing intermediary | code, invoiceTo, attention, email(s), **billingModel**, emailTemplateId |
| `EmailTemplate` | billing + follow‑up emails | subject/greeting/body/closing, **templateType**, followUpLevel, isDefault |
| `Contract` | recurring service agreement | monthlyFee, productType, billingEntity, partner, vatType, withholding, **autoApprove**, **autoSendEnabled**, **billingDayOfMonth**, status |
| `Invoice` | one bill | billingNo, status, service/VAT/withholding/net, approvedBy/rejectedBy/voidedBy, email + payment fields, follow‑up counters |
| `InvoiceLineItem` | invoice lines | description, qty, unitPrice, tax, amount, discount |
| `InvoiceAttachment` | uploaded files (binary) | filename, mimeType, size, data |
| `RcbcEndClient` | RCBC monthly roster | name, employeeCount, ratePerEmployee, month, isActive |
| `EmailLog` · `FollowUpLog` | send history | toEmail, subject, status, level (follow‑up) |
| `ScheduledBilling` · `ScheduledBillingRun` | recurring rules + run history | frequency, billingDayOfMonth, autoApprove/Send, status; run status + invoiceId |
| `HitpayPaymentRequest` | online‑payment requests | hitpayRequestId, checkoutUrl, amount, status |
| `Notification` | in‑app notifications | type, title, message, link, userId (null = broadcast) |
| `AuditLog` | audit trail | userId, action, entityType, entityId, details, ipAddress |
| `Settings` · `SystemConfig` | configuration | key, value (JSON), category |
| `ScheduledJob` · `JobRun` | job bookkeeping | name, cron, status, lastRun |

Enums: `UserRole`, `BillingModel`, `ContractStatus`, `VatType`, `BillingType`,
`BillingFrequency`, `IntervalUnit`, `InvoiceStatus`, `EmailStatus`, `NotificationType`,
`ScheduleStatus`, `RunStatus`, `HitpayPaymentStatus`, `JobStatus`.

---

## 19. Deployment

- **Hosting:** one **Next.js 16** app on **Vercel**. Function **region is pinned to Mumbai
  (`bom1`)** in `vercel.json` to co‑locate with the **Supabase `ap-south-1`** database — this
  removed a ~1.7 s‑per‑request latency floor and made pages ~10–20× faster. Keep the region
  matched to the DB region.
- **Database:** Supabase Postgres via the **PgBouncer** pooler (`connection_limit=1`); the app
  batches multi‑query reads with `prisma.$transaction([...])` so they use a single connection.
  `DATABASE_URL` is set in **Vercel env vars** (not the repo).
- **Cron:** `vercel.json` → `/api/scheduler/trigger` at `0 0 * * *` UTC (8 AM Manila), guarded
  by `CRON_SECRET` (§9).
- **Key env vars:** `DATABASE_URL`, `NEXTAUTH_SECRET`/`NEXTAUTH_URL`, SMTP creds
  (`SMTP_HOST/USER/PASSWORD`, `EMAIL_FROM`, optional `EMAIL_BCC`), `ANTHROPIC_API_KEY`,
  HitPay (`HITPAY_API_KEY`, salt), `CRON_SECRET`.
- **Build:** `prisma generate && next build`.

---

## 20. Known limitations & notes

- **HitPay webhook signature is not enforced** — it logs a warning but still processes.
  Enable strict HMAC verification before treating online payments as fully trusted.
- **No route middleware** — access control is per‑endpoint. Read endpoints gate on
  *signed‑in*, not role, and a few create/update paths rely on UI gating; the approval/admin/
  destructive actions are the hard‑enforced ones.
- **Vercel Hobby cron is approximate** — fine for daily billing, but use an external trigger if
  you need exact timing (§9).
- **AI model** is pinned to `claude-sonnet-4-20250514`; it can be bumped to a newer Claude model
  in `src/lib/ai-chat.ts`.
- **Attachments** are stored as **binary rows in Postgres** (≤5 files, ≤5 MB each) — fine at low
  volume; move to object storage if attachment use grows.
- **No open sign‑up** — an ADMIN must create every user.
