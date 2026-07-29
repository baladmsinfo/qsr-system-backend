-- CreateEnum
CREATE TYPE "public"."PaymentGatewayProvider" AS ENUM ('RAZORPAY');

-- CreateTable
CREATE TABLE "public"."PaymentGatewayConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "public"."PaymentGatewayProvider" NOT NULL DEFAULT 'RAZORPAY',
    "keyId" TEXT NOT NULL,
    "keySecret" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'test',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentGatewayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGatewayConfig_companyId_provider_key" ON "public"."PaymentGatewayConfig"("companyId", "provider");

-- AddForeignKey
ALTER TABLE "public"."PaymentGatewayConfig" ADD CONSTRAINT "PaymentGatewayConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
