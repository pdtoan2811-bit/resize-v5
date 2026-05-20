-- CreateTable
CREATE TABLE "Psd" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Layer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "psdId" TEXT NOT NULL,
    "lid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "w" INTEGER NOT NULL,
    "h" INTEGER NOT NULL,
    "z" INTEGER NOT NULL,
    "opacity" REAL NOT NULL DEFAULT 1,
    "bm" TEXT NOT NULL DEFAULT 'normal',
    "pngPath" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    CONSTRAINT "Layer_psdId_fkey" FOREIGN KEY ("psdId") REFERENCES "Psd" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "psdId" TEXT NOT NULL,
    "gid" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "importance" TEXT NOT NULL,
    "layerIds" TEXT NOT NULL,
    "anchorHint" TEXT,
    "rationale" TEXT,
    "userEdited" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Group_psdId_fkey" FOREIGN KEY ("psdId") REFERENCES "Psd" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Render" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "psdId" TEXT NOT NULL,
    "targetW" INTEGER NOT NULL,
    "targetH" INTEGER NOT NULL,
    "presetName" TEXT,
    "layoutJson" TEXT NOT NULL,
    "htmlPath" TEXT,
    "pngPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "score" REAL,
    "rubricJson" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Render_psdId_fkey" FOREIGN KEY ("psdId") REFERENCES "Psd" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImagineRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "psdId" TEXT NOT NULL,
    "targetW" INTEGER NOT NULL,
    "targetH" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "pngPath" TEXT NOT NULL,
    CONSTRAINT "ImagineRef_psdId_fkey" FOREIGN KEY ("psdId") REFERENCES "Psd" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Psd_hash_key" ON "Psd"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "Layer_psdId_lid_key" ON "Layer"("psdId", "lid");

-- CreateIndex
CREATE UNIQUE INDEX "Group_psdId_gid_key" ON "Group"("psdId", "gid");

-- CreateIndex
CREATE UNIQUE INDEX "ImagineRef_psdId_targetW_targetH_key" ON "ImagineRef"("psdId", "targetW", "targetH");
