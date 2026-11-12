-- billing-agent · migration 006 — per-partner follow-up switch
-- ADDITIVE ONLY: one new column with a default. No existing data changes.
-- Safe to re-run: IF NOT EXISTS.
-- Run over the DIRECT connection (port 5432). DDL fails on the 6543 pooler.
-- Run BEFORE deploying the code — the partners API reads this column.

BEGIN;

-- Default true keeps every existing partner behaving exactly as it does today;
-- RCBC is switched off afterwards, deliberately, from the Partners page.
ALTER TABLE "Partner"
  ADD COLUMN IF NOT EXISTS "followUpEnabled" BOOLEAN NOT NULL DEFAULT true;

COMMIT;
