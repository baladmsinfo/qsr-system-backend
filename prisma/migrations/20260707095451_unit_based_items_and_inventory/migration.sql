-- CreateEnum
CREATE TYPE "MenuItemPreparationType" AS ENUM ('PREPARED_FRESH', 'READY_TO_SERVE');

-- CreateEnum
CREATE TYPE "MenuItemUnitType" AS ENUM ('PIECE', 'GRAM', 'KG', 'ML', 'LITRE', 'CUSTOM');

-- AlterTable: MenuItem
ALTER TABLE "MenuItem"
  ADD COLUMN "preparationType" "MenuItemPreparationType" NOT NULL DEFAULT 'PREPARED_FRESH',
  ADD COLUMN "unitType" "MenuItemUnitType",
  ADD COLUMN "customUnitLabel" TEXT;

-- AlterTable: OrderItem.quantity Int -> Float
ALTER TABLE "OrderItem" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;

-- CreateTable: MenuItemStock
CREATE TABLE "MenuItemStock" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "quantityAvailable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItemStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemStock_menuItemId_branchId_key" ON "MenuItemStock"("menuItemId", "branchId");

-- AddForeignKey
ALTER TABLE "MenuItemStock" ADD CONSTRAINT "MenuItemStock_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemStock" ADD CONSTRAINT "MenuItemStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
