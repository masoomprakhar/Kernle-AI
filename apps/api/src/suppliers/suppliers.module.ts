import { Module, forwardRef } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { AuditModule } from '../audit/audit.module';
import { PimModule } from '../pim/pim.module';

@Module({
  imports: [AuditModule, forwardRef(() => PimModule)],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
