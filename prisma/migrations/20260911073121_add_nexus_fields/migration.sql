-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ServerSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serverId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "clients" INTEGER NOT NULL,
    "maxClients" INTEGER NOT NULL,
    "nexusCount" INTEGER NOT NULL DEFAULT 0,
    "nexusPlayers" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ServerSnapshot" ("clients", "code", "createdAt", "hostname", "id", "maxClients", "serverId") SELECT "clients", "code", "createdAt", "hostname", "id", "maxClients", "serverId" FROM "ServerSnapshot";
DROP TABLE "ServerSnapshot";
ALTER TABLE "new_ServerSnapshot" RENAME TO "ServerSnapshot";
CREATE INDEX "ServerSnapshot_serverId_createdAt_idx" ON "ServerSnapshot"("serverId", "createdAt");
CREATE INDEX "ServerSnapshot_code_createdAt_idx" ON "ServerSnapshot"("code", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
