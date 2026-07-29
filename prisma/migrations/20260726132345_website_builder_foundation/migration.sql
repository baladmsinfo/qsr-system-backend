-- CreateEnum
CREATE TYPE "public"."GlobalComponentKey" AS ENUM ('HEADER', 'FOOTER', 'NEWSLETTER', 'CONTACT_FORM', 'ANNOUNCEMENT_BAR', 'COOKIE_BANNER');

-- AlterTable
ALTER TABLE "public"."Page" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."Navigation" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "style" TEXT NOT NULL DEFAULT 'horizontal',
    "sticky" BOOLEAN NOT NULL DEFAULT true,
    "transparent" BOOLEAN NOT NULL DEFAULT false,
    "showSearch" BOOLEAN NOT NULL DEFAULT false,
    "showSocial" BOOLEAN NOT NULL DEFAULT false,
    "ctaButton" JSONB,
    "items" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Navigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GlobalComponent" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "key" "public"."GlobalComponentKey" NOT NULL,
    "blockType" TEXT NOT NULL,
    "props" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Navigation_websiteId_key" ON "public"."Navigation"("websiteId");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalComponent_websiteId_key_key" ON "public"."GlobalComponent"("websiteId", "key");

-- AddForeignKey
ALTER TABLE "public"."Navigation" ADD CONSTRAINT "Navigation_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GlobalComponent" ADD CONSTRAINT "GlobalComponent_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
