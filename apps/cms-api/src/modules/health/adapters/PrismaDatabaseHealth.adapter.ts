import { Injectable } from '@nestjs/common';

import { type DatabaseHealth } from '../application/CheckReadiness.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

/** Readiness ping through the app's Prisma client (the `DATABASE_HEALTH` implementation). */
@Injectable()
export class PrismaDatabaseHealth implements DatabaseHealth {
  constructor(private readonly prisma: PrismaService) {}

  async ping(timeoutMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Database ping timed out')),
        timeoutMs,
      );
    });
    try {
      await Promise.race([this.prisma.$executeRaw`SELECT 1`, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
