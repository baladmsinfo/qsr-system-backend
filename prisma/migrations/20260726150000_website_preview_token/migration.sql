-- Add previewToken as nullable first, backfill existing rows, then enforce NOT NULL + UNIQUE.
-- (Prisma's `@default(uuid())` is a client-side default, not a DB default, so a plain
-- `ADD COLUMN ... NOT NULL` would fail against the existing row without this backfill step.)
ALTER TABLE "Website" ADD COLUMN "previewToken" TEXT;

-- md5(random) instead of gen_random_uuid() - this DB doesn't have pgcrypto enabled
-- (Prisma's @default(uuid()) fields elsewhere are generated client-side, not by Postgres).
UPDATE "Website" SET "previewToken" = md5(random()::text || clock_timestamp()::text) WHERE "previewToken" IS NULL;

ALTER TABLE "Website" ALTER COLUMN "previewToken" SET NOT NULL;

CREATE UNIQUE INDEX "Website_previewToken_key" ON "Website"("previewToken");
