-- This migration cannot safely infer ownership for legacy provider
-- connections because the previous schema did not associate them with users.
-- Stop before dropping plaintext credentials if any such rows exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "IntegrationConnection" LIMIT 1) THEN
    RAISE EXCEPTION 'Backfill or disconnect legacy IntegrationConnection rows before applying architecture_foundation.';
  END IF;
END $$;

-- OAuth states are short-lived and were not user-bound in the legacy schema.
-- Invalidating them is safer than carrying them into the owned-state model.
DELETE FROM "OAuthState";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProviderName" AS ENUM ('notion', 'jira', 'clickup', 'google_calendar', 'gmail');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'DEGRADED', 'REAUTH_REQUIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SourceObjectType" AS ENUM ('TASK', 'DOCUMENT', 'MESSAGE', 'EMAIL_THREAD', 'MEETING', 'DECISION', 'COMMITMENT', 'PERSON', 'PROJECT');

-- CreateEnum
CREATE TYPE "NormalizedWorkStatus" AS ENUM ('UNKNOWN', 'NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SourceVisibility" AS ENUM ('PRIVATE', 'ORGANIZATION', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "WorkRelationType" AS ENUM ('BLOCKS', 'DEPENDS_ON', 'MENTIONS', 'BELONGS_TO', 'DECIDED_IN', 'ASSIGNED_TO', 'FOLLOWS_UP', 'CONFLICTS_WITH', 'RELATES_TO');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('IDLE', 'RUNNING', 'FAILED', 'REQUIRES_FULL_SYNC');

-- CreateEnum
CREATE TYPE "AgentTriggerType" AS ENUM ('MANUAL', 'SCHEDULE', 'EVENT');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_FOR_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActionRisk" AS ENUM ('READ', 'DRAFT', 'WRITE', 'SEND', 'DESTRUCTIVE');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PROPOSED', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'VERIFICATION_FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'VERIFIED', 'VERIFICATION_FAILED');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'AGENT', 'SYSTEM', 'PROVIDER');

-- DropIndex
DROP INDEX "IntegrationConnection_provider_workspaceId_key";

-- AlterTable
ALTER TABLE "IntegrationConnection" DROP COLUMN "accessToken",
DROP COLUMN "raw",
ADD COLUMN     "accessTokenEncrypted" TEXT NOT NULL,
ADD COLUMN     "accountId" TEXT NOT NULL,
ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "credentialKeyVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "grantedScopes" TEXT[],
ADD COLUMN     "lastErrorCode" TEXT,
ADD COLUMN     "lastErrorMessage" TEXT,
ADD COLUMN     "lastSuccessfulSyncAt" TIMESTAMP(3),
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "refreshTokenEncrypted" TEXT,
ADD COLUMN     "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT NOT NULL,
DROP COLUMN "provider",
ADD COLUMN     "provider" "ProviderName" NOT NULL;

-- AlterTable
ALTER TABLE "OAuthState" ADD COLUMN     "codeVerifier" TEXT,
ADD COLUMN     "consumedAt" TIMESTAMP(3),
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "redirectUri" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL,
DROP COLUMN "provider",
ADD COLUMN     "provider" "ProviderName" NOT NULL,
ALTER COLUMN "expiresAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "cursor" TEXT,
    "metadata" JSONB,
    "status" "SyncStatus" NOT NULL DEFAULT 'IDLE',
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessfulAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceObject" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" "ProviderName" NOT NULL,
    "nativeId" TEXT NOT NULL,
    "type" "SourceObjectType" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "nativeStatus" TEXT,
    "normalizedStatus" "NormalizedWorkStatus" NOT NULL DEFAULT 'UNKNOWN',
    "priority" INTEGER,
    "sourceUrl" TEXT,
    "authors" JSONB,
    "assignees" JSONB,
    "attendees" JSONB,
    "metadata" JSONB,
    "contentHash" TEXT,
    "visibility" "SourceVisibility" NOT NULL DEFAULT 'PRIVATE',
    "nativeCreatedAt" TIMESTAMP(3),
    "nativeUpdatedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkRelation" (
    "id" TEXT NOT NULL,
    "sourceObjectId" TEXT NOT NULL,
    "targetObjectId" TEXT NOT NULL,
    "type" "WorkRelationType" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "inferred" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceObjectId" TEXT NOT NULL,
    "excerpt" TEXT,
    "sourceVersion" TEXT,
    "metadata" JSONB,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT NOT NULL,
    "triggerType" "AgentTriggerType" NOT NULL DEFAULT 'MANUAL',
    "scheduleCron" TEXT,
    "timezone" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autonomyLevel" INTEGER NOT NULL DEFAULT 0,
    "allowedTools" TEXT[],
    "sourcePolicy" JSONB,
    "deliveryPolicy" JSONB,
    "modelPolicy" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentDefinitionId" TEXT,
    "kind" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB,
    "result" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "modelProvider" TEXT,
    "model" TEXT,
    "promptTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUsd" DECIMAL(12,6),
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceReference" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "claimKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionProposal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "connectionId" TEXT NOT NULL,
    "provider" "ProviderName" NOT NULL,
    "operation" TEXT NOT NULL,
    "targetRef" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "risk" "ActionRisk" NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "actionProposalId" TEXT NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "proposalHash" TEXT NOT NULL,
    "reason" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionExecution" (
    "id" TEXT NOT NULL,
    "actionProposalId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerReceipt" JSONB,
    "verification" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorType" "AuditActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "SyncCursor_status_lastAttemptAt_idx" ON "SyncCursor"("status", "lastAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncCursor_connectionId_scope_key" ON "SyncCursor"("connectionId", "scope");

-- CreateIndex
CREATE INDEX "SourceObject_organizationId_userId_type_deletedAt_idx" ON "SourceObject"("organizationId", "userId", "type", "deletedAt");

-- CreateIndex
CREATE INDEX "SourceObject_organizationId_normalizedStatus_dueAt_idx" ON "SourceObject"("organizationId", "normalizedStatus", "dueAt");

-- CreateIndex
CREATE INDEX "SourceObject_provider_nativeUpdatedAt_idx" ON "SourceObject"("provider", "nativeUpdatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceObject_connectionId_nativeId_key" ON "SourceObject"("connectionId", "nativeId");

-- CreateIndex
CREATE INDEX "WorkRelation_targetObjectId_type_idx" ON "WorkRelation"("targetObjectId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "WorkRelation_sourceObjectId_targetObjectId_type_key" ON "WorkRelation"("sourceObjectId", "targetObjectId", "type");

-- CreateIndex
CREATE INDEX "Evidence_organizationId_userId_observedAt_idx" ON "Evidence"("organizationId", "userId", "observedAt");

-- CreateIndex
CREATE INDEX "Evidence_sourceObjectId_idx" ON "Evidence"("sourceObjectId");

-- CreateIndex
CREATE INDEX "AgentDefinition_organizationId_userId_enabled_idx" ON "AgentDefinition"("organizationId", "userId", "enabled");

-- CreateIndex
CREATE INDEX "AgentRun_organizationId_userId_status_createdAt_idx" ON "AgentRun"("organizationId", "userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_agentDefinitionId_createdAt_idx" ON "AgentRun"("agentDefinitionId", "createdAt");

-- CreateIndex
CREATE INDEX "EvidenceReference_evidenceId_idx" ON "EvidenceReference"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceReference_agentRunId_evidenceId_claimKey_key" ON "EvidenceReference"("agentRunId", "evidenceId", "claimKey");

-- CreateIndex
CREATE UNIQUE INDEX "ActionProposal_idempotencyKey_key" ON "ActionProposal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ActionProposal_organizationId_userId_status_createdAt_idx" ON "ActionProposal"("organizationId", "userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ActionProposal_connectionId_status_idx" ON "ActionProposal"("connectionId", "status");

-- CreateIndex
CREATE INDEX "Approval_approverUserId_decidedAt_idx" ON "Approval"("approverUserId", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_actionProposalId_approverUserId_key" ON "Approval"("actionProposalId", "approverUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionExecution_actionProposalId_key" ON "ActionExecution"("actionProposalId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_agentRunId_key" ON "Report"("agentRunId");

-- CreateIndex
CREATE INDEX "Report_organizationId_ownerUserId_createdAt_idx" ON "Report"("organizationId", "ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_reportId_status_idx" ON "NotificationDelivery"("reportId", "status");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_organizationId_userId_status_idx" ON "IntegrationConnection"("organizationId", "userId", "status");

-- CreateIndex
CREATE INDEX "IntegrationConnection_provider_status_idx" ON "IntegrationConnection"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_userId_provider_accountId_key" ON "IntegrationConnection"("userId", "provider", "accountId");

-- CreateIndex
CREATE INDEX "OAuthState_userId_provider_idx" ON "OAuthState"("userId", "provider");

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- Give every existing application user a private default organization. New
-- signups create these records transactionally in UsersService.
INSERT INTO "Organization" ("id", "name", "slug", "createdAt", "updatedAt")
SELECT
  "id",
  COALESCE(NULLIF("name", ''), split_part("email", '@', 1)) || '''s Workspace',
  'workspace-' || "id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User";

INSERT INTO "Membership" ("id", "organizationId", "userId", "role", "createdAt", "updatedAt")
SELECT
  'membership-' || "id",
  "id",
  "id",
  'OWNER'::"MembershipRole",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User";

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncCursor" ADD CONSTRAINT "SyncCursor_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceObject" ADD CONSTRAINT "SourceObject_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceObject" ADD CONSTRAINT "SourceObject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceObject" ADD CONSTRAINT "SourceObject_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRelation" ADD CONSTRAINT "WorkRelation_sourceObjectId_fkey" FOREIGN KEY ("sourceObjectId") REFERENCES "SourceObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkRelation" ADD CONSTRAINT "WorkRelation_targetObjectId_fkey" FOREIGN KEY ("targetObjectId") REFERENCES "SourceObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_sourceObjectId_fkey" FOREIGN KEY ("sourceObjectId") REFERENCES "SourceObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDefinition" ADD CONSTRAINT "AgentDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDefinition" ADD CONSTRAINT "AgentDefinition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentDefinitionId_fkey" FOREIGN KEY ("agentDefinitionId") REFERENCES "AgentDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceReference" ADD CONSTRAINT "EvidenceReference_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceReference" ADD CONSTRAINT "EvidenceReference_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionProposal" ADD CONSTRAINT "ActionProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionProposal" ADD CONSTRAINT "ActionProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionProposal" ADD CONSTRAINT "ActionProposal_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionProposal" ADD CONSTRAINT "ActionProposal_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_actionProposalId_fkey" FOREIGN KEY ("actionProposalId") REFERENCES "ActionProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_actionProposalId_fkey" FOREIGN KEY ("actionProposalId") REFERENCES "ActionProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
