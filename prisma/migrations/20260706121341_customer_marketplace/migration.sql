-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'PICKUP', 'DELIVERY');

-- AlterTable: Company - marketplace discovery fields
ALTER TABLE "Company"
  ADD COLUMN "coverImageUrl" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "cuisineTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "isPubliclyListed" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Customer - global identity (login across companies)
ALTER TABLE "Customer" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "Customer" ALTER COLUMN "companyId" DROP NOT NULL;
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- AlterTable: Order - fulfillment mode
ALTER TABLE "Order" ADD COLUMN "orderType" "OrderType" NOT NULL DEFAULT 'DINE_IN';
