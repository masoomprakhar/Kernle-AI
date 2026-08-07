import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OrgsModule } from './orgs/orgs.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { InvitesModule } from './invites/invites.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { PimModule } from './pim/pim.module';
import { DamModule } from './dam/dam.module';
import { ImportExportModule } from './import-export/import-export.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { SyndicationModule } from './syndication/syndication.module';
import { AiModule } from './ai/ai.module';
import { BillingModule } from './billing/billing.module';
import { AdminModule } from './admin/admin.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { QueueModule } from './queues/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    QueueModule,
    AuthModule,
    OrgsModule,
    WorkspacesModule,
    InvitesModule,
    AuditModule,
    HealthModule,
    PimModule,
    DamModule,
    ImportExportModule,
    SuppliersModule,
    SyndicationModule,
    AiModule,
    BillingModule,
    AdminModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
