# Collections upgrade — production migration runbook

The collections stack cannot be merged before this runs: the code selects columns
that production does not have yet, so every collections endpoint (and the invoice
pages that now read `balanceDue`) would 500.

**The whole migration is additive.** No `DROP`, no column type changes, no data
rewritten. Existing rows gain new columns with defaults.

---

## Before you start

- [ ] **Take a backup.** Supabase → Database → Backups. Note the restore point.
- [ ] Have the **direct connection string** ready — port **5432**, not the 6543
      pooler. DDL fails on the pooler, and `prisma migrate diff` hangs on it.
      Supabase → Project Settings → Database → Connection string → **Direct**.
- [ ] Nobody is mid-invoice-run. Quietest slot is right after the 8 AM Manila cron.

Everything below assumes:

```bash
export DIRECT_URL="postgresql://...:5432/postgres"   # NOT 6543
```

---

## Step 1 — schema

`001-collections-upgrade.sql` adds 1 enum value, 4 enum types, 11 columns and
2 indexes. It is idempotent: re-running it changes nothing, and it has been
executed against staging to prove both.

```bash
psql "$DIRECT_URL" -f prisma/migrations-manual/001-collections-upgrade.sql
```

No psql? Paste the file into the Supabase SQL editor instead — that connects
directly and is not affected by the pooler.

## Step 2 — the four new tables

The SQL above deliberately does not hand-write `CREATE TABLE`; Prisma generates
those correctly including foreign keys.

```bash
DATABASE_URL="$DIRECT_URL" npx prisma db push
```

Expect it to report creating `CollectionRun`, `InvoicePayment`, `PdcCheck` and
`PromiseToPay`, and **no other changes**. If it proposes dropping or altering
anything, stop and re-check — that is not expected.

## Step 3 — backfill

New columns land empty. `balanceDue` in particular is read by the invoice list,
so this is not optional.

```bash
DATABASE_URL="$DIRECT_URL" npx tsx prisma/backfill-collections.ts
```

Sets `amountPaidTotal` / `balanceDue` on every invoice, and
`wht2307Status = PENDING` for paid invoices that had withholding. Idempotent.

## Step 4 — verify before deploying any code

```bash
npx tsx prisma/migrations-manual/check-migration.ts
```

Wants to print `READY — schema is fully migrated`, `balanceDue` set on every
invoice, and the sweep's `autoSendLevels`. Do not merge until it does.

## Step 5 — merge and deploy

Only now. The branch is `feat/collections-pr9-wht2307` (19 commits, main already
merged in).

## Step 6 — confirm the sweep is still dormant

The nightly sweep is wired into the existing daily cron, so deploying arms the
schedule. It ships **dormant** — `collections.autoSendLevels` defaults to `[]`
and the in-sweep fallback is `[]` too, so a missing settings row means silence,
not "chase everything".

After the first nightly run, check `CollectionRun`:

```sql
SELECT "runDate", "invoicesScanned", "followUpsSent", suppressed
FROM "CollectionRun" ORDER BY "runDate" DESC LIMIT 3;
```

Expect `followUpsSent = 0` and `suppressed` describing what it *would* have
sent. That report is what Mich reviews before any level is armed in Settings.

**If `followUpsSent` is not 0, something armed it — set
`collections.autoSendLevels` to `[]` in Settings immediately.**

---

## Rollback

Code: revert the deploy. The added columns are harmless to the old code — it
never selects them — so **the schema does not need to be rolled back**, and
leaving it in place means no data loss from the backfill.

If the schema must go, restore the backup from step 0. Dropping the columns by
hand would discard any payments recorded through the new path.

---

## Known state at time of writing (2026-09-08)

Preflight against production says NOT READY, as expected — none of the 11
columns, 4 tables or 4 enum types exist yet, and `InvoiceStatus` has no
`PARTIALLY_PAID`. That is exactly what this runbook adds.
