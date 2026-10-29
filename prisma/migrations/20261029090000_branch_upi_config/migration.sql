-- CreateTable
CREATE TABLE "public"."BranchUpiConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'test',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchUpiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchUpiConfig_branchId_key" ON "public"."BranchUpiConfig"("branchId");

-- CreateIndex
CREATE INDEX "BranchUpiConfig_companyId_idx" ON "public"."BranchUpiConfig"("companyId");

-- AddForeignKey
ALTER TABLE "public"."BranchUpiConfig" ADD CONSTRAINT "BranchUpiConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BranchUpiConfig" ADD CONSTRAINT "BranchUpiConfig_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
