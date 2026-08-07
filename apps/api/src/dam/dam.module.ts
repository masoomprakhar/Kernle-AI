import { Module } from '@nestjs/common';
import { DamController } from './dam.controller';
import { DamService } from './dam.service';
import { StorageService } from './storage.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [DamController],
  providers: [DamService, StorageService],
  exports: [DamService, StorageService],
})
export class DamModule {}
