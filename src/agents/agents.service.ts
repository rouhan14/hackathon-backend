import { Injectable } from '@nestjs/common';

export interface AgentAutonomyPolicy {
  level: number;
  allowedTools: string[];
  requiresApprovalFor: string[];
}

@Injectable()
export class AgentsService {
  normalizeAutonomyPolicy(policy: AgentAutonomyPolicy): AgentAutonomyPolicy {
    return {
      level: Math.min(Math.max(policy.level, 0), 5),
      allowedTools: [...new Set(policy.allowedTools)],
      requiresApprovalFor: [...new Set(policy.requiresApprovalFor)],
    };
  }
}
