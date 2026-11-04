-- billing-agent · migration 005 — daily Worklist
-- ADDITIVE ONLY: two new tables and one new enum. No existing table changes.
-- Safe to re-run: every statement checks before it creates.
-- Run over the DIRECT connection (port 5432). DDL fails on the 6543 pooler.
-- Run BEFORE deploying the code, then check with check-migration.ts.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "WorklistStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "WorklistItem" (
    "id" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "doneDate" DATE,
    "contractId" TEXT,
    "title" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "WorklistStatus" NOT NULL DEFAULT 'TODO',
    "targetAmount" DECIMAL(15,2),
    "uninvoicedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorklistNote" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'NOTE',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorklistNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorklistItem_startDate_idx" ON "WorklistItem"("startDate");
CREATE INDEX IF NOT EXISTS "WorklistItem_doneDate_idx" ON "WorklistItem"("doneDate");
CREATE INDEX IF NOT EXISTS "WorklistItem_contractId_idx" ON "WorklistItem"("contractId");
CREATE INDEX IF NOT EXISTS "WorklistItem_ownerId_idx" ON "WorklistItem"("ownerId");
CREATE INDEX IF NOT EXISTS "WorklistNote_itemId_createdAt_idx" ON "WorklistNote"("itemId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "WorklistItem" ADD CONSTRAINT "WorklistItem_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WorklistItem" ADD CONSTRAINT "WorklistItem_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WorklistItem" ADD CONSTRAINT "WorklistItem_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WorklistNote" ADD CONSTRAINT "WorklistNote_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "WorklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "WorklistNote" ADD CONSTRAINT "WorklistNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
