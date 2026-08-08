import { Module, forwardRef } from '@nestjs/common';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { PimModule } from '../pim/pim.module';
import { DamModule } from '../dam/dam.module';

@Module({
  imports: [AuditModule, BillingModule, DamModule, forwardRef(() => PimModule)],
  controllers: [IntelligenceController],
  providers: [IntelligenceService],
  exports: [IntelligenceService],
})
export class IntelligenceModule {}
