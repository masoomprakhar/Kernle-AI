import { Module, forwardRef } from '@nestjs/common';
import { ImportExportController } from './import-export.controller';
import { ImportExportService } from './import-export.service';
import { AuditModule } from '../audit/audit.module';
import { PimModule } from '../pim/pim.module';
import { BillingModule } from '../billing/billing.module';
import { DamModule } from '../dam/dam.module';

@Module({
  imports: [AuditModule, forwardRef(() => PimModule), BillingModule, DamModule],
  controllers: [ImportExportController],
  providers: [ImportExportService],
  exports: [ImportExportService],
})
export class ImportExportModule {}
