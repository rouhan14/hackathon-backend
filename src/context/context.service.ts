import { Injectable } from '@nestjs/common';
import { Prisma, SourceObjectType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContextService {
  constructor(private readonly prisma: PrismaService) {}

  findRecent(input: {
    organizationId: string;
    userId: string;
    types?: SourceObjectType[];
    limit?: number;
  }) {
    const where = {
      organizationId: input.organizationId,
      userId: input.userId,
      deletedAt: null,
      ...(input.types?.length ? { type: { in: input.types } } : {}),
    } satisfies Prisma.SourceObjectWhereInput;

    return this.prisma.sourceObject.findMany({
      where,
      orderBy: [{ nativeUpdatedAt: 'desc' }, { updatedAt: 'desc' }],
      take: Math.min(Math.max(input.limit ?? 50, 1), 200),
    });
  }
}
