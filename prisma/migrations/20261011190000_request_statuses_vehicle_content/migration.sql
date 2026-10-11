PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Existing regular pending/in-progress requests become NEW.
UPDATE "Order" SET "status" = 'NEW' WHERE "status" = 'IN_PROGRESS';
UPDATE "Order" SET "status" = 'NEW' WHERE "status" = 'PLANNED' AND "type" = 'REGULAR';

ALTER TABLE "Vehicle" ADD COLUMN "specsDescription" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "cargoDescription" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "cargoItems" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "serviceArea" TEXT;

-- Убираем только старую демонстрационную партнёрскую машину из seed, если по ней нет истории.
DELETE FROM "VehicleImage"
WHERE "vehicleId" IN (
  SELECT "id" FROM "Vehicle"
  WHERE "slug" = 'partner-truck'
    AND NOT EXISTS (SELECT 1 FROM "Order" WHERE "Order"."vehicleId" = "Vehicle"."id")
);
DELETE FROM "Vehicle"
WHERE "slug" = 'partner-truck'
  AND NOT EXISTS (SELECT 1 FROM "Order" WHERE "Order"."vehicleId" = "Vehicle"."id");
DELETE FROM "Carrier"
WHERE "phoneNormalized" = '+79000000000'
  AND NOT EXISTS (SELECT 1 FROM "Vehicle" WHERE "Vehicle"."carrierId" = "Carrier"."id");

CREATE TABLE "new_Order" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "type" TEXT NOT NULL DEFAULT 'REGULAR',
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "clientId" INTEGER NOT NULL,
  "pickupAddress" TEXT,
  "destinationAddress" TEXT,
  "cargoType" TEXT,
  "loadersRequired" BOOLEAN,
  "vehicle" TEXT,
  "vehicleId" INTEGER,
  "amountCents" INTEGER,
  "paidAmountCents" INTEGER NOT NULL DEFAULT 0,
  "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
  "paymentMethod" TEXT,
  "source" TEXT NOT NULL DEFAULT 'Другое',
  "notes" TEXT,
  "searchText" TEXT NOT NULL DEFAULT '',
  "scheduledAt" DATETIME,
  "startedAt" DATETIME,
  "completedAt" DATETIME,
  "cancelledAt" DATETIME,
  "createdById" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Order_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Order" ("id","type","status","clientId","pickupAddress","destinationAddress","cargoType","loadersRequired","vehicle","vehicleId","amountCents","paidAmountCents","paymentStatus","paymentMethod","source","notes","searchText","scheduledAt","startedAt","completedAt","cancelledAt","createdById","createdAt","updatedAt")
SELECT "id","type","status","clientId","pickupAddress","destinationAddress","cargoType","loadersRequired","vehicle","vehicleId","amountCents","paidAmountCents","paymentStatus","paymentMethod","source","notes","searchText","scheduledAt",NULL,"completedAt","cancelledAt","createdById","createdAt","updatedAt" FROM "Order";

DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "Order_scheduledAt_idx" ON "Order"("scheduledAt");
CREATE INDEX "Order_completedAt_idx" ON "Order"("completedAt");
CREATE INDEX "Order_clientId_createdAt_idx" ON "Order"("clientId", "createdAt");
CREATE INDEX "Order_vehicleId_createdAt_idx" ON "Order"("vehicleId", "createdAt");
CREATE INDEX "Order_source_createdAt_idx" ON "Order"("source", "createdAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
