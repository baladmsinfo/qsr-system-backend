-- CreateEnum
CREATE TYPE "public"."PrinterConnectionType" AS ENUM ('NETWORK', 'USB', 'BLUETOOTH', 'WEBUSB', 'WEBSERIAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."PrintFormat" AS ENUM ('ESC_POS', 'HTML', 'PDF', 'PNG');

-- CreateEnum
CREATE TYPE "public"."ReceiptTemplateType" AS ENUM ('RECEIPT', 'KOT', 'INVOICE');

-- CreateEnum
CREATE TYPE "public"."PrinterJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."PrinterProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paperWidthMm" INTEGER NOT NULL DEFAULT 80,
    "charsPerLine" INTEGER NOT NULL DEFAULT 48,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrinterProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Printer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "printerProfileId" TEXT,
    "name" TEXT NOT NULL,
    "connectionType" "public"."PrinterConnectionType" NOT NULL,
    "connectionConfig" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReceiptTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."ReceiptTemplateType" NOT NULL DEFAULT 'RECEIPT',
    "layoutJson" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PrinterJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "receiptTemplateId" TEXT,
    "orderId" TEXT,
    "format" "public"."PrintFormat" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "public"."PrinterJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrinterJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PrintHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "printerId" TEXT,
    "receiptTemplateId" TEXT,
    "orderId" TEXT,
    "format" "public"."PrintFormat" NOT NULL,
    "status" "public"."PrinterJobStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrinterProfile_companyId_name_key" ON "public"."PrinterProfile"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Printer_companyId_name_key" ON "public"."Printer"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptTemplate_companyId_name_key" ON "public"."ReceiptTemplate"("companyId", "name");

-- AddForeignKey
ALTER TABLE "public"."PrinterProfile" ADD CONSTRAINT "PrinterProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Printer" ADD CONSTRAINT "Printer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Printer" ADD CONSTRAINT "Printer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Printer" ADD CONSTRAINT "Printer_printerProfileId_fkey" FOREIGN KEY ("printerProfileId") REFERENCES "public"."PrinterProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptTemplate" ADD CONSTRAINT "ReceiptTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PrinterJob" ADD CONSTRAINT "PrinterJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PrinterJob" ADD CONSTRAINT "PrinterJob_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "public"."Printer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PrinterJob" ADD CONSTRAINT "PrinterJob_receiptTemplateId_fkey" FOREIGN KEY ("receiptTemplateId") REFERENCES "public"."ReceiptTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PrintHistory" ADD CONSTRAINT "PrintHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PrintHistory" ADD CONSTRAINT "PrintHistory_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "public"."Printer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PrintHistory" ADD CONSTRAINT "PrintHistory_receiptTemplateId_fkey" FOREIGN KEY ("receiptTemplateId") REFERENCES "public"."ReceiptTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
