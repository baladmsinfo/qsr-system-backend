-- CreateEnum
CREATE TYPE "public"."WebsiteStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "public"."PageStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "public"."Website" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Website',
    "status" "public"."WebsiteStatus" NOT NULL DEFAULT 'DRAFT',
    "customDomain" TEXT,
    "themeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Page" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isHome" BOOLEAN NOT NULL DEFAULT false,
    "draftBlocks" JSONB NOT NULL,
    "publishedBlocks" JSONB,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "status" "public"."PageStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PageVersion" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "blocks" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Asset" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "key" TEXT,
    "filename" TEXT NOT NULL,
    "mimetype" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Theme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colors" JSONB NOT NULL,
    "fontHeading" TEXT,
    "fontBody" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Website_companyId_key" ON "public"."Website"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Website_customDomain_key" ON "public"."Website"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Page_websiteId_slug_key" ON "public"."Page"("websiteId", "slug");

-- AddForeignKey
ALTER TABLE "public"."Website" ADD CONSTRAINT "Website_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Website" ADD CONSTRAINT "Website_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "public"."Theme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Page" ADD CONSTRAINT "Page_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PageVersion" ADD CONSTRAINT "PageVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "public"."Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Asset" ADD CONSTRAINT "Asset_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
