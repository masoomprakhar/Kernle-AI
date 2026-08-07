import { Module, forwardRef } from '@nestjs/common';
import { PimController } from './pim.controller';
import { PimService } from './pim.service';
import { CompletenessService } from './completeness.service';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [AuditModule, forwardRef(() => BillingModule)],
  controllers: [PimController],
  providers: [PimService, CompletenessService],
  exports: [PimService, CompletenessService],
})
export class PimModule {}
