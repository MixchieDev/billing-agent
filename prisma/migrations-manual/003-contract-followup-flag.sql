-- billing-agent · migration 003 — per-client follow-up control
-- Generated from the staging column definition, which is already validated.
-- ADDITIVE ONLY: no DROP, no data change, existing rows untouched.
-- Run over the DIRECT connection (port 5432). DDL fails on the 6543 pooler.

BEGIN;

-- Whether the automated follow-up ladder may chase this client's invoices.
-- New invoices inherit it at creation. Defaults to true so nothing changes for
-- existing contracts on migration; switching the current book off is a
-- separate, deliberate step (see the runbook).
ALTER TABLE "Contract"
  ADD COLUMN IF NOT EXISTS "followUpEnabled" BOOLEAN NOT NULL DEFAULT true;

COMMIT;
