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

    // Hackathon mode: allow WRITE actions (e.g. create Jira ticket / Notion page)
    // without an explicit approval step. SEND and DESTRUCTIVE remain gated.
    if (input.risk === ActionRisk.WRITE) {
      return {
        allowed: true,
        requiresApproval: false,
        reason: 'Writes are permitted without approval in this build.',
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
