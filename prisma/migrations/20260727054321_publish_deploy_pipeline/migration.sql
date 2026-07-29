-- CreateEnum
CREATE TYPE "public"."DeploymentStatus" AS ENUM ('QUEUED', 'GENERATING', 'BUILDING', 'DEPLOYING', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "public"."DomainVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."DomainSslStatus" AS ENUM ('NONE', 'PENDING', 'ACTIVE', 'FAILED');

-- CreateTable
CREATE TABLE "public"."Deployment" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "previewUrl" TEXT,
    "productionUrl" TEXT,
    "status" "public"."DeploymentStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Domain" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "public"."DomainVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verificationToken" TEXT NOT NULL,
    "sslStatus" "public"."DomainSslStatus" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_websiteId_version_key" ON "public"."Deployment"("websiteId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_hostname_key" ON "public"."Domain"("hostname");

-- AddForeignKey
ALTER TABLE "public"."Deployment" ADD CONSTRAINT "Deployment_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Domain" ADD CONSTRAINT "Domain_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
