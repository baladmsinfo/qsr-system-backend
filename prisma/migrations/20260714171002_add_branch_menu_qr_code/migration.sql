-- DropForeignKey
ALTER TABLE "public"."Customer" DROP CONSTRAINT "Customer_companyId_fkey";

-- AlterTable
ALTER TABLE "public"."Branch" ADD COLUMN     "menuQrCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_menuQrCode_key" ON "public"."Branch"("menuQrCode");

-- AddForeignKey
ALTER TABLE "public"."Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
