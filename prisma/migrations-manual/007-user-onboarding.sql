-- billing-agent · migration 007 — Get started (onboarding gate)
-- ADDITIVE: two nullable timestamp columns on "User", then a backfill so every
-- user who exists today is treated as already onboarded. Without the backfill
-- every non-admin would be sent to the course at their next sign-in.
-- Safe to re-run: IF NOT EXISTS, and the backfill only touches NULLs.
-- Run over the DIRECT connection (port 5432). DDL fails on the 6543 pooler.
-- Run BEFORE deploying the code — the dashboard layout reads these columns.

BEGIN;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingWalkthroughAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt"   TIMESTAMP(3);

-- Everyone already using the system has, in effect, been onboarded.
UPDATE "User"
   SET "onboardingWalkthroughAt" = COALESCE("onboardingWalkthroughAt", CURRENT_TIMESTAMP),
       "onboardingCompletedAt"   = COALESCE("onboardingCompletedAt",   CURRENT_TIMESTAMP)
 WHERE "onboardingCompletedAt" IS NULL;

COMMIT;
