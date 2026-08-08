-- CreateEnum
CREATE TYPE "SourceDocumentType" AS ENUM ('url', 'pdf', 'text_paste', 'image');

-- CreateEnum
CREATE TYPE "SourceDocumentStatus" AS ENUM ('pending', 'parsed', 'failed');

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT,
    "type" "SourceDocumentType" NOT NULL,
    "rawContent" TEXT,
    "storageKey" TEXT,
    "filename" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "status" "SourceDocumentStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AiSuggestion" ADD COLUMN "sourceDocumentId" TEXT;
ALTER TABLE "AiSuggestion" ADD COLUMN "explanation" JSONB;

-- CreateIndex
CREATE INDEX "SourceDocument_organizationId_productId_idx" ON "SourceDocument"("organizationId", "productId");

-- CreateIndex
CREATE INDEX "SourceDocument_organizationId_status_idx" ON "SourceDocument"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AiSuggestion_sourceDocumentId_idx" ON "AiSuggestion"("sourceDocumentId");

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
