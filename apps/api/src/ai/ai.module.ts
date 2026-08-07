import { Module, forwardRef } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { PimModule } from '../pim/pim.module';

@Module({
  imports: [AuditModule, BillingModule, forwardRef(() => PimModule)],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
