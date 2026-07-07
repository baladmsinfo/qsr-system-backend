-- AlterEnum
ALTER TYPE "KitchenTicketStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "KitchenTicket" ADD COLUMN "dismissedAt" TIMESTAMP(3);
