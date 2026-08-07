-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('Owner', 'Admin', 'CatalogManager', 'Contributor', 'Viewer');

-- CreateEnum
CREATE TYPE "UseCase" AS ENUM ('Retail', 'B2B_Manufacturing', 'Fashion', 'Food_Beverage', 'Other');

-- CreateEnum
CREATE TYPE "SkuBand" AS ENUM ('lt_1k', 'one_k_10k', 'ten_k_100k', 'hundred_k_plus');

-- CreateEnum
CREATE TYPE "AttributeType" AS ENUM ('text', 'textarea', 'number', 'boolean', 'date', 'select', 'multiselect', 'price', 'media', 'metric');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('pending', 'running', 'success', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "UpdateBehavior" AS ENUM ('create_only', 'update_only', 'upsert');

-- CreateEnum
CREATE TYPE "SupplierSubmissionStatus" AS ENUM ('pending_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('shopify', 'bigcommerce', 'amazon', 'walmart', 'generic_api', 'print');

-- CreateEnum
CREATE TYPE "SyndicationAction" AS ENUM ('create', 'update', 'delete');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('in_sync', 'pending', 'error');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('Starter', 'Growth', 'Enterprise');

-- CreateEnum
CREATE TYPE "AssetRole" AS ENUM ('main_image', 'gallery', 'swatch', 'spec_sheet', 'other');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "industry" TEXT,
    "useCase" "UseCase",
    "skuBand" "SkuBand",
    "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
    "plan" "PlanTier" NOT NULL DEFAULT 'Starter',
    "stripeCustomerId" TEXT,
    "stripeSubId" TEXT,
    "aiCreditsUsed" INTEGER NOT NULL DEFAULT 0,
    "aiCreditsLimit" INTEGER NOT NULL DEFAULT 500,
    "skuLimit" INTEGER NOT NULL DEFAULT 1000,
    "seatLimit" INTEGER NOT NULL DEFAULT 5,
    "channelLimit" INTEGER NOT NULL DEFAULT 2,
    "featureFlags" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,
    "description" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleName" "RoleName" NOT NULL DEFAULT 'Contributor',
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Locale" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Locale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "locales" TEXT[],
    "categoryTreeId" TEXT,
    "activationStatus" TEXT NOT NULL DEFAULT 'draft',
    "connectorType" "ConnectorType",
    "credentialsEnc" TEXT,
    "fieldMapping" JSONB NOT NULL DEFAULT '{}',
    "categoryMapping" JSONB NOT NULL DEFAULT '{}',
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AttributeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attribute" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" JSONB NOT NULL,
    "type" "AttributeType" NOT NULL,
    "scopable" BOOLEAN NOT NULL DEFAULT false,
    "localizable" BOOLEAN NOT NULL DEFAULT false,
    "validationRules" JSONB NOT NULL DEFAULT '{}',
    "unit" TEXT,
    "options" JSONB NOT NULL DEFAULT '[]',
    "groupId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" JSONB NOT NULL,
    "labelAttributeCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyAttribute" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "requiredForCompleteness" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FamilyAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" JSONB NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "productCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductModel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "variantAxes" TEXT[],
    "sharedValues" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "familyId" TEXT,
    "productModelId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "values" JSONB NOT NULL DEFAULT '{}',
    "completeness" JSONB NOT NULL DEFAULT '{}',
    "geoScore" INTEGER NOT NULL DEFAULT 0,
    "geoBreakdown" JSONB NOT NULL DEFAULT '{}',
    "searchText" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("productId","categoryId")
);

-- CreateTable
CREATE TABLE "ProductComment" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration" DOUBLE PRECISION,
    "tags" TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "thumbnailKey" TEXT,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" JSONB NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetProductLink" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "role" "AssetRole" NOT NULL DEFAULT 'gallery',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssetProductLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "columnMapping" JSONB NOT NULL DEFAULT '{}',
    "updateBehavior" "UpdateBehavior" NOT NULL DEFAULT 'upsert',
    "scheduleCron" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileId" TEXT,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'pending',
    "fileKey" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "errorLog" JSONB NOT NULL DEFAULT '[]',
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetFormat" TEXT NOT NULL,
    "filter" JSONB NOT NULL DEFAULT '{}',
    "fieldSelection" JSONB NOT NULL DEFAULT '[]',
    "destination" TEXT NOT NULL DEFAULT 'download',
    "webhookUrl" TEXT,
    "scheduleCron" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fileKey" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "startedById" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactInfo" JSONB NOT NULL DEFAULT '{}',
    "portalAccessToken" TEXT NOT NULL,
    "categoryIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierSubmission" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "submittedValues" JSONB NOT NULL DEFAULT '{}',
    "status" "SupplierSubmissionStatus" NOT NULL DEFAULT 'pending_review',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyndicationRule" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "requireEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minCompleteness" INTEGER NOT NULL DEFAULT 95,
    "filter" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "SyndicationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyndicationLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    "action" "SyndicationAction" NOT NULL,
    "status" TEXT NOT NULL,
    "responsePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyndicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductChannelSync" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'pending',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "externalId" TEXT,

    CONSTRAINT "ProductChannelSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSuggestion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT,
    "attributeCode" TEXT,
    "suggestedValue" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,
    "rating" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "fixAction" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSignal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PermissionToRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PermissionToRole_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Workspace_organizationId_idx" ON "Workspace"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_organizationId_slug_key" ON "Workspace"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailToken_userId_type_idx" ON "EmailToken"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE INDEX "Invite_organizationId_idx" ON "Invite"("organizationId");

-- CreateIndex
CREATE INDEX "Invite_email_idx" ON "Invite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Locale_organizationId_code_key" ON "Locale"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Channel_organizationId_idx" ON "Channel"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_organizationId_code_key" ON "Channel"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeGroup_organizationId_code_key" ON "AttributeGroup"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Attribute_organizationId_idx" ON "Attribute"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Attribute_organizationId_code_key" ON "Attribute"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Family_organizationId_code_key" ON "Family"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyAttribute_familyId_attributeId_key" ON "FamilyAttribute"("familyId", "attributeId");

-- CreateIndex
CREATE INDEX "Category_organizationId_parentId_idx" ON "Category"("organizationId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_organizationId_code_key" ON "Category"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductModel_organizationId_code_key" ON "ProductModel"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Product_organizationId_enabled_idx" ON "Product"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "Product_organizationId_familyId_idx" ON "Product"("organizationId", "familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_sku_key" ON "Product"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "ProductComment_productId_idx" ON "ProductComment"("productId");

-- CreateIndex
CREATE INDEX "Asset_organizationId_idx" ON "Asset"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_organizationId_code_key" ON "AssetCategory"("organizationId", "code");

-- CreateIndex
CREATE INDEX "AssetProductLink_productId_idx" ON "AssetProductLink"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetProductLink_assetId_productId_role_key" ON "AssetProductLink"("assetId", "productId", "role");

-- CreateIndex
CREATE INDEX "ImportJob_organizationId_status_idx" ON "ImportJob"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_portalAccessToken_key" ON "Supplier"("portalAccessToken");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_idx" ON "Supplier"("organizationId");

-- CreateIndex
CREATE INDEX "SupplierSubmission_supplierId_status_idx" ON "SupplierSubmission"("supplierId", "status");

-- CreateIndex
CREATE INDEX "SyndicationLog_organizationId_channelId_idx" ON "SyndicationLog"("organizationId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductChannelSync_productId_channelId_key" ON "ProductChannelSync"("productId", "channelId");

-- CreateIndex
CREATE INDEX "AiSuggestion_organizationId_status_idx" ON "AiSuggestion"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AiUsageLog_organizationId_createdAt_idx" ON "AiUsageLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "QualityFinding_organizationId_resolved_idx" ON "QualityFinding"("organizationId", "resolved");

-- CreateIndex
CREATE INDEX "MarketSignal_organizationId_sku_idx" ON "MarketSignal"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "_PermissionToRole_B_index" ON "_PermissionToRole"("B");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locale" ADD CONSTRAINT "Locale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_categoryTreeId_fkey" FOREIGN KEY ("categoryTreeId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeGroup" ADD CONSTRAINT "AttributeGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attribute" ADD CONSTRAINT "Attribute_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attribute" ADD CONSTRAINT "Attribute_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AttributeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyAttribute" ADD CONSTRAINT "FamilyAttribute_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyAttribute" ADD CONSTRAINT "FamilyAttribute_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "Attribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModel" ADD CONSTRAINT "ProductModel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModel" ADD CONSTRAINT "ProductModel_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComment" ADD CONSTRAINT "ProductComment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetCategory" ADD CONSTRAINT "AssetCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AssetCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetProductLink" ADD CONSTRAINT "AssetProductLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetProductLink" ADD CONSTRAINT "AssetProductLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportProfile" ADD CONSTRAINT "ImportProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ImportProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportProfile" ADD CONSTRAINT "ExportProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ExportProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierSubmission" ADD CONSTRAINT "SupplierSubmission_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierSubmission" ADD CONSTRAINT "SupplierSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyndicationRule" ADD CONSTRAINT "SyndicationRule_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyndicationLog" ADD CONSTRAINT "SyndicationLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyndicationLog" ADD CONSTRAINT "SyndicationLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductChannelSync" ADD CONSTRAINT "ProductChannelSync_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductChannelSync" ADD CONSTRAINT "ProductChannelSync_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityFinding" ADD CONSTRAINT "QualityFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSignal" ADD CONSTRAINT "MarketSignal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

