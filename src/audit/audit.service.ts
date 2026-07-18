import { Injectable } from '@nestjs/common';
import { AuditActorType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: {
    organizationId: string;
    actorUserId?: string;
    actorType: AuditActorType;
    action: string;
    resourceType: string;
    resourceId?: string;
    requestId?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.auditEvent.create({ data: input });
  }
}
