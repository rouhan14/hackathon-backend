ALTER TABLE "IntegrationConnection" ADD COLUMN "credentialGroupId" TEXT;

CREATE INDEX "IntegrationConnection_userId_provider_credentialGroupId_idx"
ON "IntegrationConnection"("userId", "provider", "credentialGroupId");
