import { Injectable } from '@nestjs/common';
import { ActionRisk } from '@prisma/client';

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
}

@Injectable()
export class PolicyEngineService {
  evaluateAction(input: {
    risk: ActionRisk;
    hasExactApproval: boolean;
  }): PolicyDecision {
    if (input.risk === ActionRisk.DESTRUCTIVE) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: 'Destructive actions are disabled in the initial product.',
      };
    }

    if (input.risk === ActionRisk.READ || input.risk === ActionRisk.DRAFT) {
      return {
        allowed: true,
        requiresApproval: false,
        reason: 'The action has no external side effect.',
      };
    }

    return input.hasExactApproval
      ? {
          allowed: true,
          requiresApproval: false,
          reason: 'The exact action payload has been approved.',
        }
      : {
          allowed: false,
          requiresApproval: true,
          reason: 'External writes and sends require exact approval.',
        };
  }
}
