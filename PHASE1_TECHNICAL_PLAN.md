# Phase 1 Technical Plan — Collections Engine

*Implementation plan for BILLING_AGENT_COLLECTIONS_UPGRADE.md · Phase 1 ("Collections engine").*
*Status: **plan only** — no code written yet. Awaiting (a) sign‑off on this plan and (b) a `STAGING_DATABASE_URL` to run the schema push + backfill against before prod.*

---

## 0. Scope & approach

**Phase 1 = the engine, not the UI.** Deliverable per the brief: *"one full week of auto‑driven
follow‑ups with zero hand‑built lists."* That needs: the schema, payments‑with‑partials + EWT
settlement, promise‑to‑pay, the cron ladder (L1–L3) + broken‑promise resurfacing, and a
`CollectionRun` log. The **collections dashboard, follow‑up queue, PDC register, and reports are
Phase 2–4** and are *not* built here — Phase 1 only makes the minimum surgical UI edits needed so
`PARTIALLY_PAID` and balances render correctly on the existing screens.

**Deliberately deferred out of Phase 1** (kept in the schema where cheap, logic later):
- **L4 suspension‑notice flow** → Phase 3 (ladder caps at L3 here).
- **PDC reminders/register** → Phase 3 (the `PdcCheck` *model* ships in PR‑1 so the schema is
  stable, but no sweep logic/UI until there's a way to enter checks).
- **Maker ≠ checker + risk tiering** → Phase 5 (`createdById`/`reviewFlag` columns ship now,
  unused, so the later change is code‑only).
- **2307 reporting, bank‑rec `suggest` endpoint, multi‑tenancy** → Phases 4–6.

**Shape:** four reviewable PRs, smallest‑blast‑radius first. Each is independently shippable and
green (`tsc` + `jest`) before the next.

**DB rollout (staging‑first, per your choice):** every schema/backfill step runs against
`STAGING_DATABASE_URL` first; I verify row counts and spot‑check, then **you** run `prisma db push`
+ the backfill against production. All Phase‑1 schema changes are **additive** (new tables, new
enum *values*, new nullable/defaulted columns) so Postgres applies them without rewriting existing
rows and they're reversible.

---

## PR‑1 — Schema + backfill (no behavior change)

### `prisma/schema.prisma`
**Enums:**
- Extend `enum InvoiceStatus` → add `PARTIALLY_PAID` (logically between `SENT` and `PAID`).
- New: `Wht2307Status { NOT_APPLICABLE PENDING RECEIVED }`, `ReviewFlag { UNCHANGED CHANGED }`,
  `PtpStatus { OPEN KEPT BROKEN }`, `PdcStatus { WAREHOUSED DEPOSITED CLEARED BOUNCED }`.

**`Invoice` — new columns (all nullable or defaulted):**
- `createdById String?` — maker id (plain string, no FK, mirroring `preparedBy`/`reviewedBy`;
  unused until Phase 5).
- `reviewFlag ReviewFlag @default(CHANGED)` — risk tiering (unused until Phase 5).
- `amountPaidTotal Decimal @default(0) @db.Decimal(15,2)`
- `balanceDue Decimal? @db.Decimal(15,2)` — maintained as `netAmount − amountPaidTotal`.
- `wht2307Status Wht2307Status @default(NOT_APPLICABLE)`, `wht2307ReceivedAt DateTime?`
- `followUpPausedUntil DateTime?`, `suspensionNoticeAt DateTime?`, `suspendedAt DateTime?`
- Relations: `payments InvoicePayment[]`, `promises PromiseToPay[]`, `pdcChecks PdcCheck[]`.
- New indexes: `@@index([wht2307Status])`, `@@index([followUpPausedUntil])`.
- **Legacy fields kept:** `paidAt`, `paidAmount`, `paymentMethod`, `paymentReference` stay and are
  still maintained (for full‑settlement compat + zero‑downtime reads).

**New models:**
- `InvoicePayment` — `id, invoiceId, amount Decimal(15,2), method String, reference String?,
  paidDate DateTime, isEwtShort Boolean @default(false), source String @default("MANUAL"),
  recordedBy String?, createdAt`; `@@index([invoiceId])`. (`source` ∈ MANUAL | HITPAY_WEBHOOK |
  BANKREC_SUGGESTED.)
- `PromiseToPay` — `id, invoiceId, promisedDate, promisedAmount Decimal?(15,2), madeBy String?,
  capturedBy String, channel String?, status PtpStatus @default(OPEN), notes String?, createdAt,
  updatedAt`; `@@index([invoiceId])`, `@@index([status, promisedDate])`.
- `PdcCheck` — `id, invoiceId String?, checkNo, bankName, amount Decimal(15,2), checkDate,
  status PdcStatus @default(WAREHOUSED), location String?, depositedAt?, clearedAt?, bouncedAt?,
  notes?, createdAt, updatedAt`; `@@index([invoiceId])`, `@@index([status, checkDate])`.
- `CollectionRun` (mirrors `ScheduledBillingRun`/`JobRun`) — `id, runDate @default(now()),
  status JobStatus, invoicesScanned Int @default(0), followUpsSent Int @default(0),
  promisesBroken Int @default(0), errors Json?, createdAt`.

### `prisma/backfill-collections.ts` (new one‑off `tsx` script, idempotent)
1. For every invoice: set `amountPaidTotal` = `paidAmount ?? netAmount` when `status = PAID`, else
   `0`; set `balanceDue = netAmount − amountPaidTotal`.
2. Convert legacy single payments → one `InvoicePayment` per PAID invoice with a `paidAt`
   (`amount = paidAmount ?? netAmount`, `method = paymentMethod ?? 'BANK_TRANSFER'`,
   `reference = paymentReference`, `paidDate = paidAt`, `source='MANUAL'`). **Skip invoices that
   already have payment rows** (idempotent re‑run).
3. Seed `wht2307Status = PENDING` for PAID invoices with `withholdingTax > 0` and no 2307 on file
   (default: all such → PENDING; or apply Mich's known‑received list if provided — §10.5).

### Verification / rollout
- `prisma generate` → `npx tsc --noEmit` → `npx jest` all green.
- Push to **staging**, run backfill on staging, verify: `count(InvoicePayment) == count(PAID w/ paidAt)`,
  `balanceDue == 0` for PAID, `== netAmount` for unpaid, no negative balances.
- Then **you** `db push` + backfill on prod.
- **No behavior change ships in PR‑1** — the new `PARTIALLY_PAID` value is inert until PR‑2.

---

## PR‑2 — Record‑payment (partials + EWT) + `PARTIALLY_PAID` surface

### New `src/lib/payment-service.ts` — single source of truth
`recordPayment({ invoiceId, amount, method, reference, paidDate, source, recordedBy })`:
1. Load invoice (`netAmount, withholdingTax, hasWithholding, status, amountPaidTotal`). Reject
   unless status ∈ `SENT | PARTIALLY_PAID`.
2. In a `prisma.$transaction`: insert `InvoicePayment`; recompute
   `amountPaidTotal = Σ payments`, `balanceDue = netAmount − amountPaidTotal`.
3. **Settlement logic** (tolerance ₱1):
   - **EWT‑short:** client withholds and `|balanceDue − withholdingTax| ≤ 1` → status `PAID`,
     `wht2307Status = PENDING`, mark this payment `isEwtShort = true`.
   - **Full:** `balanceDue ≤ 1` → `PAID`.
   - **Partial:** `balanceDue > 1` → `PARTIALLY_PAID`.
4. Maintain legacy fields (`paidAmount = amountPaidTotal`; on PAID also set `paidAt`/`paymentMethod`/
   `paymentReference` from the settling payment). Write audit (`INVOICE_PAYMENT_RECORDED`, plus
   `INVOICE_PAID` on full settlement) + `notifyInvoicePaid` on PAID.

### Files changed
- `src/app/api/invoices/[id]/mark-paid/route.ts` → thin wrapper over `recordPayment` (keep the path
  the modal already calls; now accepts partials, allows `SENT | PARTIALLY_PAID`).
- `src/app/api/webhooks/hitpay/route.ts` → call `recordPayment(source:'HITPAY_WEBHOOK')` instead of
  directly setting PAID (one code path; handles partial online payments; keeps idempotency).
- `src/components/dashboard/mark-paid-modal.tsx` → show **balance due**, default amount to
  balance, hint *"settles via EWT — 2307 pending"* when applicable.
- **`PARTIALLY_PAID` ripple sweep** (grep‑driven checklist — status is referenced in ~25 files):
  - Stats: `src/lib/billing-service.ts` + `src/lib/server-data.ts` + `src/lib/chat-tools.ts`
    (`getInvoiceStats` groupBy) — count `PARTIALLY_PAID`, and use `balanceDue` (not `netAmount`) as
    outstanding.
  - Filters/badges: `invoice-filters.tsx`, `invoice-table.tsx`, `invoice-list-page.tsx`
    (add the status option + a badge colour; show balance; allow **Record payment** on
    `PARTIALLY_PAID`).
  - `src/lib/scheduler.ts` / `auto-send.ts` / `invoice-generator.ts` — audit any `status === 'PAID'`
    / `=== 'SENT'` assumptions that should now include `PARTIALLY_PAID`.
- Export (`invoices/export/route.ts`): add partial payments + a **2307‑pending** column — *optional
  here, can slip to Phase 4.*

### Tests
`tests/payment-service.test.ts` (jest + existing Prisma mock): full settle, partial, EWT‑short,
overpayment, idempotency, wrong‑status rejection. Update any test asserting "only SENT → PAID".

---

## PR‑3 — Promise‑to‑Pay

### Files
- `src/app/api/invoices/[id]/promises/route.ts` — `POST` (create OPEN; sets
  `invoice.followUpPausedUntil = promisedDate`; `capturedBy = session.user.id`; audit) and `GET`
  (list). Role: ADMIN/APPROVER.
- `src/app/api/promises/[id]/route.ts` — `PATCH` to mark `KEPT`/`BROKEN` or cancel (clears the
  pause).
- Minimal UI entry point: a **"Log promise"** action on the invoice row/history modal. *Full PTP
  UI (client collection page) is Phase 2* — Phase 1 only needs the API + a lightweight trigger.
- Tests for create → pause set, and break → pause cleared.

---

## PR‑4 — Collections sweep (the cron ladder)

### New `src/lib/collections-service.ts` — `triggerCollectionsSweep()`
1. Load `collections` settings (defaults `l1Days:1, l2Days:7, l3Days:15, suspendDays:30,
   autoSendLevels:[1,2,3], firstSweepCap:20`).
2. **Select** invoices `status ∈ {SENT, PARTIALLY_PAID}`, `followUpEnabled`, past due,
   **not paused** (`followUpPausedUntil` null or `< now`).
3. **Ladder:** `daysOverdue` → target level via offsets; if `target > lastFollowUpLevel` **and**
   `target ∈ autoSendLevels`, send through the existing `follow-up-service.ts` machinery.
   **Idempotent:** skip if a `FollowUpLog` at that level already exists (mirrors
   `checkExistingInvoiceForPeriod`). **Ladder caps at L3 in Phase 1** (L4 = Phase 3).
4. **Broken promises:** mark OPEN `PromiseToPay` `BROKEN` where `promisedDate < today` & unpaid;
   clear `followUpPausedUntil`; queue a broken‑promise follow‑up (reuse the L2 template + a new
   `{{promisedDate}}` placeholder).
5. **First‑sweep safety cap:** limit auto‑sends to `firstSweepCap`/day so long‑stale accounts get a
   human‑reviewed re‑entry, not a sudden L3 blast (§9 of the brief). Log what was capped.
6. Write a **`CollectionRun`** with counts (scanned / sent / promises broken / errors). Use the
   project's sequential/`$transaction`‑batched Prisma pattern (`connection_limit=1`).

### Files changed
- `src/app/api/scheduler/trigger/route.ts` — after `triggerBillingJob()`, call
  `triggerCollectionsSweep()` as a **second phase** on the same cron; return both results. Same
  `CRON_SECRET`/admin guard (no new cron entry needed in `vercel.json`).
- `src/lib/email-service.ts` — add `{{promisedDate}}` to `replacePlaceholders`.
- `src/lib/settings.ts` — add the `collections` category to `DEFAULTS` (Settings → Collections UI
  is Phase 2; defaults are read from here meanwhile).
- **Add a HitPay pay‑link to follow‑up emails** (currently only initial sends) — reduce friction
  exactly when chasing (brief §4.7).
- Tests: selection filter, ladder level math, idempotency, broken‑promise resurfacing, first‑sweep
  cap.

---

## Cross‑cutting

**Rollout runbook (per PR):** branch → `tsc`+`jest` green → push preview → (PR‑1 only: push schema
+ backfill to **staging**, verify) → your review → merge → you apply schema to prod (PR‑1) → watch
one cron cycle (PR‑4).

**Config defaults I'll ship (all in Settings, so tunable without a deploy):** ladder `1/7/15`,
`autoSendLevels:[1,2,3]`, first‑sweep cap `20/day`. Your §10 decisions (segment‑specific offsets,
L1‑auto/L2‑3‑draft‑for‑two‑weeks) become settings toggles rather than code — so they don't block
Phase 1 and you can change them live.

**Risk register:**
| Risk | Mitigation |
|---|---|
| `record-payment` is live money logic | Single shared `payment-service.ts` + full unit tests + staging first |
| `PARTIALLY_PAID` breaks a status assumption somewhere | Grep‑driven checklist of the ~25 referencing files in PR‑2 |
| Cron double‑sends follow‑ups | `FollowUpLog`‑level idempotency + first‑sweep cap |
| Backfill mis‑computes balances | Staging dry‑run + count/asserts before prod |
| Long‑stale accounts get an L3 blast | First‑sweep cap + human re‑entry for the 61+ book |

**Blocked on you:** ① approve this plan; ② provide `STAGING_DATABASE_URL` (for PR‑1's push +
backfill dry‑run). Everything else proceeds PR‑by‑PR from there.
