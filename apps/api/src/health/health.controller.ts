import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { captureException } from '../common/sentry';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'kernle-api', ts: new Date().toISOString() };
  }

  /** Deliberate error for Sentry verification in staging/prod. */
  @Get('sentry-test')
  sentryTest() {
    const err = new ServiceUnavailableException('Deliberate Kernle API Sentry test error');
    captureException(err);
    throw err;
  }
}
