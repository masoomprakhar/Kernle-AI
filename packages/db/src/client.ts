import { Prisma, PrismaClient } from '@prisma/client';

const TENANT_MODELS = new Set([
  'Organization',
  'Membership',
  'Workspace',
  'AuditLog',
  'Invite',
  'Locale',
  'Channel',
  'AttributeGroup',
  'Attribute',
  'Family',
  'Category',
  'ProductModel',
  'Product',
  'Asset',
  'AssetCategory',
  'ImportProfile',
  'ImportJob',
  'ExportProfile',
  'ExportJob',
  'Supplier',
  'SyndicationLog',
  'AiSuggestion',
  'AiUsageLog',
  'AiConversation',
  'QualityFinding',
  'MarketSignal',
  'SourceDocument',
]);

function modelHasOrgId(model: string | undefined): boolean {
  return !!model && TENANT_MODELS.has(model);
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export type TenantClient = ReturnType<typeof createTenantClient>;

/**
 * Returns a Prisma client extension that injects organizationId into
 * reads/writes for tenant-scoped models. Cross-tenant access throws.
 */
export function createTenantClient(base: PrismaClient, organizationId: string) {
  if (!organizationId) {
    throw new Error('organizationId is required for tenant client');
  }

  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!modelHasOrgId(model) || model === 'Organization') {
            if (model === 'Organization') {
              if (['findUnique', 'findFirst', 'findUniqueOrThrow', 'findFirstOrThrow'].includes(operation)) {
                const a = args as { where?: { id?: string } };
                if (a.where?.id && a.where.id !== organizationId) {
                  throw new Error('TENANT_ISOLATION: cross-organization access denied');
                }
              }
            }
            return query(args);
          }

          const a = args as {
            where?: Record<string, unknown>;
            data?: Record<string, unknown> | Record<string, unknown>[];
            create?: Record<string, unknown>;
            update?: Record<string, unknown>;
          };

          if (operation === 'create') {
            a.data = { ...(a.data as object), organizationId };
          } else if (operation === 'createMany') {
            const rows = a.data;
            if (Array.isArray(rows)) {
              a.data = rows.map((r) => ({ ...r, organizationId }));
            }
          } else if (operation === 'upsert') {
            a.create = { ...(a.create as object), organizationId };
            a.update = { ...(a.update as object) };
            a.where = { ...a.where, organizationId };
          } else {
            a.where = { ...a.where, organizationId };
          }

          if (['update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
            const where = a.where ?? {};
            if (where.organizationId && where.organizationId !== organizationId) {
              throw new Error('TENANT_ISOLATION: cross-organization access denied');
            }
            a.where = { ...where, organizationId };
          }

          return query(a);
        },
      },
    },
  });
}

export { Prisma };
