import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPrismaClient, createTenantClient, PrismaClient } from '@kernle/db';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private client = createPrismaClient();

  get user() {
    return this.client.user;
  }
  get organization() {
    return this.client.organization;
  }
  get membership() {
    return this.client.membership;
  }
  get role() {
    return this.client.role;
  }
  get permission() {
    return this.client.permission;
  }
  get workspace() {
    return this.client.workspace;
  }
  get auditLog() {
    return this.client.auditLog;
  }
  get refreshToken() {
    return this.client.refreshToken;
  }
  get emailToken() {
    return this.client.emailToken;
  }
  get invite() {
    return this.client.invite;
  }
  get locale() {
    return this.client.locale;
  }
  get channel() {
    return this.client.channel;
  }
  get attribute() {
    return this.client.attribute;
  }
  get attributeGroup() {
    return this.client.attributeGroup;
  }
  get family() {
    return this.client.family;
  }
  get familyAttribute() {
    return this.client.familyAttribute;
  }
  get category() {
    return this.client.category;
  }
  get product() {
    return this.client.product;
  }
  get productModel() {
    return this.client.productModel;
  }
  get productCategory() {
    return this.client.productCategory;
  }
  get productComment() {
    return this.client.productComment;
  }
  get asset() {
    return this.client.asset;
  }
  get assetCategory() {
    return this.client.assetCategory;
  }
  get assetProductLink() {
    return this.client.assetProductLink;
  }
  get importProfile() {
    return this.client.importProfile;
  }
  get importJob() {
    return this.client.importJob;
  }
  get exportProfile() {
    return this.client.exportProfile;
  }
  get exportJob() {
    return this.client.exportJob;
  }
  get supplier() {
    return this.client.supplier;
  }
  get supplierSubmission() {
    return this.client.supplierSubmission;
  }
  get syndicationRule() {
    return this.client.syndicationRule;
  }
  get syndicationLog() {
    return this.client.syndicationLog;
  }
  get productChannelSync() {
    return this.client.productChannelSync;
  }
  get aiSuggestion() {
    return this.client.aiSuggestion;
  }
  get aiUsageLog() {
    return this.client.aiUsageLog;
  }
  get aiConversation() {
    return this.client.aiConversation;
  }
  get aiFeedback() {
    return this.client.aiFeedback;
  }
  get qualityFinding() {
    return this.client.qualityFinding;
  }
  get marketSignal() {
    return this.client.marketSignal;
  }

  get $transaction() {
    return this.client.$transaction.bind(this.client);
  }
  get $queryRaw() {
    return this.client.$queryRaw.bind(this.client);
  }
  get $executeRaw() {
    return this.client.$executeRaw.bind(this.client);
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  forTenant(organizationId: string) {
    return createTenantClient(this.client, organizationId);
  }

  raw(): PrismaClient {
    return this.client;
  }
}
