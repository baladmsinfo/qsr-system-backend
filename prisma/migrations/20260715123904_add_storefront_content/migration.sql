-- CreateTable
CREATE TABLE "public"."StorefrontContent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "heroTag" TEXT,
    "heroHeadline" TEXT,
    "heroSubtext" TEXT,
    "heroImageUrl" TEXT,
    "promiseTitle" TEXT,
    "promiseSubtitle" TEXT,
    "promiseItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "storyTitle" TEXT,
    "storyBody" TEXT,
    "storyPillars" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whyChooseTitle" TEXT,
    "whyChooseItems" JSONB NOT NULL DEFAULT '[]',
    "philosophyTitle" TEXT,
    "philosophyLines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "testimonialsTitle" TEXT,
    "testimonials" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorefrontContent_companyId_key" ON "public"."StorefrontContent"("companyId");

-- AddForeignKey
ALTER TABLE "public"."StorefrontContent" ADD CONSTRAINT "StorefrontContent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
