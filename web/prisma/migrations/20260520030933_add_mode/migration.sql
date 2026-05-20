-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Render" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "psdId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'responsive',
    "targetW" INTEGER NOT NULL,
    "targetH" INTEGER NOT NULL,
    "presetName" TEXT,
    "layoutJson" TEXT NOT NULL,
    "htmlPath" TEXT,
    "pngPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "score" REAL,
    "rubricJson" TEXT,
    "reasoning" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Render_psdId_fkey" FOREIGN KEY ("psdId") REFERENCES "Psd" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Render" ("attempts", "costUsd", "createdAt", "htmlPath", "id", "latencyMs", "layoutJson", "pngPath", "presetName", "psdId", "rubricJson", "score", "status", "targetH", "targetW") SELECT "attempts", "costUsd", "createdAt", "htmlPath", "id", "latencyMs", "layoutJson", "pngPath", "presetName", "psdId", "rubricJson", "score", "status", "targetH", "targetW" FROM "Render";
DROP TABLE "Render";
ALTER TABLE "new_Render" RENAME TO "Render";
CREATE UNIQUE INDEX "Render_psdId_mode_targetW_targetH_key" ON "Render"("psdId", "mode", "targetW", "targetH");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
