import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from 'src/prisma/prisma.service';
import { Public } from '../decorators/public.decorator';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process answers. Never touches the database. */
  @Get()
  @ApiOperation({ summary: 'Liveness check' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  check() {
    return { status: 'ok' };
  }

  /** Readiness: the database answers a trivial query. */
  @Get('db')
  @ApiOperation({ summary: 'Database readiness check' })
  @ApiOkResponse({ schema: { example: { status: 'ok', database: 'up' } } })
  async db() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is temporarily unavailable',
      });
    }
  }
}
