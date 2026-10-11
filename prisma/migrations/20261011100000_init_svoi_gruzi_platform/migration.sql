PRAGMA foreign_keys=OFF;

CREATE TABLE "User" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'OWNER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Session" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tokenHash" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Client" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT,
  "phone" TEXT,
  "phoneNormalized" TEXT,
  "defaultVehicle" TEXT,
  "notes" TEXT,
  "searchText" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "deletedAt" DATETIME
);

CREATE TABLE "Carrier" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "companyName" TEXT,
  "phone" TEXT NOT NULL,
  "phoneNormalized" TEXT NOT NULL,
  "email" TEXT,
  "notes" TEXT,
  "commissionPercent" REAL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Vehicle" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortDescription" TEXT,
  "description" TEXT,
  "previewImage" TEXT,
  "capacityKg" INTEGER,
  "volumeM3" REAL,
  "bodyLengthM" REAL,
  "bodyWidthM" REAL,
  "bodyHeightM" REAL,
  "bodyType" TEXT,
  "loadingType" TEXT,
  "categories" TEXT NOT NULL DEFAULT '',
  "ownershipType" TEXT NOT NULL DEFAULT 'OWN',
  "carrierId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "published" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Vehicle_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "VehicleImage" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "vehicleId" INTEGER NOT NULL,
  "image" TEXT NOT NULL,
  "alt" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleImage_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Order" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "type" TEXT NOT NULL DEFAULT 'REGULAR',
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
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

CREATE TABLE "Task" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'TODO',
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "dueAt" DATETIME,
  "completedAt" DATETIME,
  "createdById" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Expense" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "amountCents" INTEGER NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'OTHER',
  "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "createdById" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Activity" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "actorId" INTEGER,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" INTEGER,
  "title" TEXT NOT NULL,
  "metadata" TEXT,
  "ipAddress" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE UNIQUE INDEX "Client_phoneNormalized_key" ON "Client"("phoneNormalized");
CREATE UNIQUE INDEX "Vehicle_slug_key" ON "Vehicle"("slug");

CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "Client_createdAt_idx" ON "Client"("createdAt");
CREATE INDEX "Client_deletedAt_updatedAt_idx" ON "Client"("deletedAt", "updatedAt");
CREATE INDEX "Carrier_isActive_name_idx" ON "Carrier"("isActive", "name");
CREATE INDEX "Carrier_phoneNormalized_idx" ON "Carrier"("phoneNormalized");
CREATE INDEX "Vehicle_published_sortOrder_idx" ON "Vehicle"("published", "sortOrder");
CREATE INDEX "Vehicle_ownershipType_status_idx" ON "Vehicle"("ownershipType", "status");
CREATE INDEX "Vehicle_carrierId_idx" ON "Vehicle"("carrierId");
CREATE INDEX "VehicleImage_vehicleId_sortOrder_idx" ON "VehicleImage"("vehicleId", "sortOrder");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "Order_scheduledAt_idx" ON "Order"("scheduledAt");
CREATE INDEX "Order_completedAt_idx" ON "Order"("completedAt");
CREATE INDEX "Order_clientId_createdAt_idx" ON "Order"("clientId", "createdAt");
CREATE INDEX "Order_vehicleId_createdAt_idx" ON "Order"("vehicleId", "createdAt");
CREATE INDEX "Order_source_createdAt_idx" ON "Order"("source", "createdAt");
CREATE INDEX "Task_status_dueAt_idx" ON "Task"("status", "dueAt");
CREATE INDEX "Expense_occurredAt_idx" ON "Expense"("occurredAt");
CREATE INDEX "Expense_category_occurredAt_idx" ON "Expense"("category", "occurredAt");
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");
CREATE INDEX "Activity_entityType_entityId_idx" ON "Activity"("entityType", "entityId");
CREATE INDEX "Activity_actorId_createdAt_idx" ON "Activity"("actorId", "createdAt");

PRAGMA foreign_keys=ON;
