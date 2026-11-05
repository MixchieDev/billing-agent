# Receivables feed: billing agent → cash management

Status: decisions settled 2026-10-29. **Phase 1 built**: the cash app side is live
(cash-management-app#1, 2026-11-04), and the billing agent side ships with this
document. The feed stays off until `cashSync.receivablesEnabled` is switched on.
Phases 2 and 3 are not started.

## Why

The cash management app forecasts collections from contract fees alone. It never
sees an invoice or a payment, so:

- money already owed disappears: anything dated before today is dropped as
  "already in the bank", even when it was never paid
- early payments are counted twice until their forecast date passes
- amounts are the contract fee, not the cash that lands (VAT, withholding)
- every client is assumed to pay 10 days late

Finance and leadership use it for cash position and working capital over
periods, so the near term must reflect real invoices and the long term still
needs the contract-based view.

## Decisions already made

| Topic | Decision |
|---|---|
| Overdue money | **Only client commitments count as cash.** An overdue invoice counts only with an open promise to pay or a pending PDC, on that date. Without one: 1–60 days overdue → **"Awaiting commitment"** line; over 60 days → **"At risk"** line. Neither is counted as cash. |
| Cleaning up the overdue book | Collections staff work the uncommitted invoices client by client: log a promise / PDC, or void. Each commitment moves money back into the forecast on its date. |
| Invoices awaiting approval (PENDING) | Not money owed yet, but they block the contract-based guess for their month. |
| Invoice covering several contracts | One receivable, listing all its customer numbers. |
| History | 13 months of paid invoices and payments. |
| Amounts | Net cash: what lands in the bank. Billing agent computes it from the contract's active scheduled billing (amount, VAT type, withholding) with the same `calculateBilling` call the invoice generator makes: VAT added on top, withholding taken off the service fee. The cash app does no tax maths. |
| Payment timing | Billing agent computes each client's usual lag from payment history. Promise-to-pay and PDC dates beat any average. |
| Reliability score | Computed by billing agent; no longer owned by the cash app. |
| Bank routing (forecast) | Stays manual per customer in the cash app. New customers surface in a "bank not set" list instead of defaulting to "Main Account". |
| Bank routing (actuals) | Payments now record their bank account (`InvoicePayment.receivedInBank/AccountNo`, PR #3). |

## Shape of the solution

```
billing agent (Postgres, source of truth)          cash management (Convex)
───────────────────────────────────────           ─────────────────────────
Contract ──────── /sync-contracts (exists) ─────▶ customerContracts
  + expectedCashPerCycle, paymentLagDays            (future, un-invoiced cycles)

Invoice + promises + PDCs ── /sync-receivables ─▶ receivables      (new)
                                                    (what is owed, and when)

InvoicePayment ───────────── /sync-collections ─▶ collections      (new)
                                                    (what actually landed, per bank)
```

One-way, as today. Receivables and collections are **wholly owned by billing
agent**; the cash app only reads them.

A receivable does not need a matching customer record in the cash app. It
carries its own entity, customer name and amount, so AR is complete even for the
36 CSV-imported records that still have no customer number.

## 1. What billing agent sends

### Receivable: one per invoice

Keyed by the invoice's id (cuid). `billingNo` is display-only because it is not
unique across entities.

| Field | Notes |
|---|---|
| `invoiceId` | key |
| `entity` | YOWI / ABBA |
| `billingNo`, `customerName` | display |
| `customerNumbers[]` | from the invoice's contracts; usually one |
| `periodStart`, `statementDate`, `dueDate` | period falls back to the statement month when `periodStart` is empty (manual invoices) |
| `netAmount`, `balanceDue` | cash terms, already net of withholding |
| `vatAmount` | the invoice's VAT, for the VAT payment line (Phase 2) |
| `state` | `OPEN` (APPROVED, SENT), `PARTIAL`, `PAID`, `VOID` |
| `expectedDate`, `expectedSource` | see below |
| `promisedAmount` | when a promise sets the date |

**Expected date**, first match wins:
1. open promise to pay: its date (and amount, if given), `expectedSource: PROMISE`
2. pending PDC: its cheque date, `expectedSource: PDC`
3. not yet due: `dueDate + client lag`, `expectedSource: TERMS`
4. overdue with none of the above: no date, `expectedSource: NONE`

Aging is **computed by the cash app each day from `dueDate`**. That way an
uncommitted invoice moves from "Awaiting commitment" to "At risk" on day 61
without billing agent pushing anything. A promise that passes unpaid is marked
BROKEN by billing agent's nightly sweep and re-sent with `expectedSource: NONE`.

### Collection: one per payment

| Field | Notes |
|---|---|
| `paymentId` | key |
| `invoiceId`, `entity`, `customerNumber` | |
| `amount`, `paidDate`, `method` | |
| `receivedInBank`, `receivedInAccountNo` | null for HitPay and older payments |

### Contract: two added fields

| Field | Notes |
|---|---|
| `expectedCashPerCycle` | net cash of one cycle of the active scheduled billing; null when the contract has no active schedule |
| `cycleMonths`, `dueDayOfMonth` | from the same schedule |
| `paymentLagDays` | median of (paid date − due date) over the client's last 6 settled invoices, clamped to 0–90; null with fewer than 2 |

`reliabilityScore` (share paid within 7 days of due) moves to billing-owned in
the same change.

### When it is sent

- **On each change**, via `after()` like the contract sync. Covered writes:
  invoice approve / send / void, `recordPayment`, promise create / cancel /
  break, PDC create / update.
- **Nightly reconcile** pushes all non-closed receivables, plus everything closed
  or paid in the last 13 months for history. This is the backstop. It needs
  `cashSync.nightlyReconcile` switched **on**, which this work assumes.
- Voided or deleted invoices are sent as `VOID` rather than dropped, so the cash
  app removes them.

## 2. What the cash app does with it

### New tables

- `receivables`: indexed by `invoiceId`, `entity`, `customerNumber`
- `collections`: indexed by `paymentId`, `entity` + `paidDate`

Both are written only by the new HTTP routes (`/sync-receivables`,
`/sync-collections`, batch upsert, same API key).

### Projection engine

Inflows become four buckets instead of one:

1. **Committed or not yet due → counted as cash.** `balanceDue` (or the
   promised amount) on `expectedDate`. Includes invoices over 60 days that have
   a commitment.
2. **Awaiting commitment: 1–60 days overdue, no promise or PDC.** Own line and
   total, not counted as cash.
3. **At risk: over 60 days overdue, no promise or PDC.** Own line and total, not
   counted as cash.
4. **Contract cycles not yet invoiced.** `expectedCashPerCycle` on
   invoice day + payment terms + `paymentLagDays`. A cycle is skipped when any
   receivable (any state, including paid) or a PENDING invoice exists for that
   customer number in that cycle. That stops paid and invoiced months being
   counted again.

"Drop everything before today" goes away. Past cash is either in a receivable
(still owed) or a collection (already landed).

### VAT payments (outflow)

Today the projection leaves VAT out on both sides: collections are contract
fees before VAT, and there is no VAT payment. Once collections become net
cash (fee + VAT − withholding), the VAT inside them is money owed to the BIR,
so the engine must also pay it out. **Both switch in the same release.**
Switching collections alone overstates cash by about 12% of VAT sales.

- One outflow per quarter, due on the 25th of the month after the quarter
  ends (2550Q), per entity.
- Amount: output VAT for the quarter minus input VAT. Output VAT comes from
  the `vatAmount` billing agent sends on each receivable, plus VAT on contract
  cycles not yet invoiced. Whether output VAT is counted on invoices issued or
  on cash received in the quarter is set once per entity, following the
  accountant's filing basis.
- Input VAT is not in billing agent. Phase 2 takes it as a manual figure per
  quarter in the cash app's Settings; it can come from expense data later.
- A quarter already filed is entered as the actual amount paid and stops being
  estimated, the way the Q4 Cash Flow page handles the Q3 2550Q.
- Withholding needs no outflow. The client withholds and remits it, so it is
  simply never part of the cash collected (`netAmount` already excludes it).

### Starting cash

The latest bank balance per account, **plus collections into that account dated
after the balance date**. Without this, a payment received after the last
balance entry would vanish: no longer forecast, not yet in the balance.

This needs each cash app bank account (setting `bank_accounts`, currently
`{ name, entity }`) to carry the billing account number it corresponds to. Add
`billingAccountNo` to that setting and edit it in the cash app's Settings.

### New views

- **Awaiting commitment** and **At risk** panels: by client, age and amount,
  so leadership can see how much of the book has no commitment behind it.
- **Actual vs forecast by month**: collections per month against what was
  forecast for that month. Needs a nightly snapshot of the forecast (phase 3).
- **Working capital by period**: cash + collectible AR (≤ 60 days) − payables due.

## 3. Phasing

Each phase ships on its own and leaves things working.

**Phase 1: feed, dormant.** Billing agent: payload builders, net-per-cycle and
lag calculations, change hooks, nightly push. Cash app: two tables and two
routes. The engine is unchanged, so nothing on screen moves. Done when cash
app totals match billing agent's open AR to the peso.

**Phase 2: forecast uses it.** Engine reads receivables and suppresses
invoiced cycles. Adds the Awaiting commitment and At risk lines, net amounts and
per-client lag. In billing agent, a **"Needs a commitment" worklist** under
Collections: every overdue invoice with no open promise or pending PDC, oldest
and largest first, with Log promise / Record PDC / Void actions. This is the
cleanup tool. Before
switching on, show leadership the new vs old forecast side by side. The at-risk
line will be large and the near term lower than they are used to.

Phase 2 also adds the **VAT payment line** (see "VAT payments" above) in
the same release as the switch to net-cash collections, never after it.

**Phase 3: actuals and working capital.** Account mapping, collections since
the last balance, the actual-vs-forecast view, forecast snapshots and the
working-capital view.

Also, while in `convex/http.ts`: constant-time API key comparison, CORS
limited to what is needed, and one shared status map instead of two copies.

## Dependency

Billing agent can't deploy anything until migration 004 is on the prod database
and the current deployment is promoted again (prod was rolled back on
2026-10-23). The collections feed also reads the 004 columns. Phase 1 can be
built and validated on staging in the meantime.
