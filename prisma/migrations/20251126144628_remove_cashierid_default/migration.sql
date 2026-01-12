-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_sales" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleNumber" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "subtotal" REAL NOT NULL,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "cashierId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_sales" ("cashierId", "createdAt", "discountAmount", "id", "notes", "paymentMethod", "saleNumber", "status", "subtotal", "taxAmount", "totalAmount", "updatedAt") SELECT "cashierId", "createdAt", "discountAmount", "id", "notes", "paymentMethod", "saleNumber", "status", "subtotal", "taxAmount", "totalAmount", "updatedAt" FROM "sales";
DROP TABLE "sales";
ALTER TABLE "new_sales" RENAME TO "sales";
CREATE UNIQUE INDEX "sales_saleNumber_key" ON "sales"("saleNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
