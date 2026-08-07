import { Module } from '@nestjs/common';
import { SyndicationController } from './syndication.controller';
import { SyndicationService } from './syndication.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [SyndicationController],
  providers: [SyndicationService],
  exports: [SyndicationService],
})
export class SyndicationModule {}
