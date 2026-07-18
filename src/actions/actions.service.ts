import { Injectable } from '@nestjs/common';
import { ActionRisk } from '@prisma/client';
import {
  PolicyDecision,
  PolicyEngineService,
} from '../policy/policy-engine.service';

@Injectable()
export class ActionsService {
  constructor(private readonly policy: PolicyEngineService) {}

  authorizeExecution(input: {
    risk: ActionRisk;
    hasExactApproval: boolean;
  }): PolicyDecision {
    return this.policy.evaluateAction(input);
  }
}
