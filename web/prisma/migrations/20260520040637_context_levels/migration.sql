-- AlterTable
ALTER TABLE "Psd" ADD COLUMN "iterationNotes" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "brandName" TEXT,
    "voice" TEXT,
    "audience" TEXT,
    "doRules" TEXT,
    "dontRules" TEXT,
    "freeform" TEXT,
    "updatedAt" DATETIME NOT NULL
);
