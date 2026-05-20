-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Psd" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iterationNotes" TEXT,
    "sourceEngine" TEXT NOT NULL DEFAULT 'algorithm',
    "sourceAiReason" TEXT
);
INSERT INTO "new_Psd" ("createdAt", "filename", "hash", "height", "id", "iterationNotes", "width") SELECT "createdAt", "filename", "hash", "height", "id", "iterationNotes", "width" FROM "Psd";
DROP TABLE "Psd";
ALTER TABLE "new_Psd" RENAME TO "Psd";
CREATE UNIQUE INDEX "Psd_hash_key" ON "Psd"("hash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
