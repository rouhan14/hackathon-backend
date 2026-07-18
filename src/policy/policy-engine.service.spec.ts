import { ActionRisk } from '@prisma/client';
import { PolicyEngineService } from './policy-engine.service';

describe('PolicyEngineService', () => {
  const policy = new PolicyEngineService();

  it('allows reads without approval', () => {
    expect(
      policy.evaluateAction({
        risk: ActionRisk.READ,
        hasExactApproval: false,
      }),
    ).toMatchObject({ allowed: true, requiresApproval: false });
  });

  it('requires exact approval for writes', () => {
    expect(
      policy.evaluateAction({
        risk: ActionRisk.WRITE,
        hasExactApproval: false,
      }),
    ).toMatchObject({ allowed: false, requiresApproval: true });

    expect(
      policy.evaluateAction({
        risk: ActionRisk.WRITE,
        hasExactApproval: true,
      }),
    ).toMatchObject({ allowed: true, requiresApproval: false });
  });

  it('blocks destructive actions even with approval', () => {
    expect(
      policy.evaluateAction({
        risk: ActionRisk.DESTRUCTIVE,
        hasExactApproval: true,
      }),
    ).toMatchObject({ allowed: false, requiresApproval: false });
  });
});
