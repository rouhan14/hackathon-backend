import { Injectable } from '@nestjs/common';
import { ProviderName } from '@prisma/client';

export interface SyncRequest {
  connectionId: string;
  organizationId: string;
  userId: string;
  provider: ProviderName;
  scope: string;
  fullSync: boolean;
}

@Injectable()
export class SyncCoordinatorService {
  createRequest(input: SyncRequest): SyncRequest {
    // Queue transport is intentionally outside the domain contract. BullMQ can
    // consume this request once Redis is added in the reliability phase.
    return { ...input };
  }
}
