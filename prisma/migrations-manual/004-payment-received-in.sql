-- billing-agent · migration 004 — which bank account a payment landed in
-- ADDITIVE ONLY: no DROP, no data change, existing rows untouched.
-- Run over the DIRECT connection (port 5432). DDL fails on the 6543 pooler.
-- Run BEFORE deploying the code: Prisma reads every InvoicePayment column, so
-- the new code against the old schema breaks Record Payment.

BEGIN;

-- Snapshot of the entity bank account chosen on Record Payment. Null for
-- HitPay payments and everything recorded before this migration.
ALTER TABLE "InvoicePayment"
  ADD COLUMN IF NOT EXISTS "receivedInBank" TEXT,
  ADD COLUMN IF NOT EXISTS "receivedInAccountNo" TEXT;

COMMIT;
