import { Module } from '@nestjs/common';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}
