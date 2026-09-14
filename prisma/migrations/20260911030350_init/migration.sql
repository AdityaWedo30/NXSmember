-- CreateTable
CREATE TABLE "ServerSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serverId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "clients" INTEGER NOT NULL,
    "maxClients" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ServerSnapshot_serverId_createdAt_idx" ON "ServerSnapshot"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "ServerSnapshot_code_createdAt_idx" ON "ServerSnapshot"("code", "createdAt");
