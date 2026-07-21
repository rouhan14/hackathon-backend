import { Injectable, Logger } from '@nestjs/common';
import { AgentRunStatus } from '@prisma/client';
import { ConnectionsService } from '../connections/connections.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ToolLoopToolTrace } from './model-provider';
import { boundJsonForStorage } from './tool-result';

const MAX_RESULT_JSON_CHARS = 20_000;

@Injectable()
export class BrainRunService {
  private readonly logger = new Logger(BrainRunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: ConnectionsService,
  ) {}

  /**
   * Best-effort: never throw to callers. Brain answers must not fail because
   * audit persistence is down.
   */
  async start(input: {
    userId: string;
    message: string;
    connectionIds: string[];
    toolNames: string[];
  }): Promise<string | undefined> {
    try {
      const organizationId =
        await this.connections.findDefaultOrganizationIdForUser(input.userId);
      const run = await this.prisma.agentRun.create({
        data: {
          organizationId,
          userId: input.userId,
          kind: 'assistant.brain',
          status: AgentRunStatus.RUNNING,
          startedAt: new Date(),
          input: {
            message: input.message,
            connectionIds: input.connectionIds,
            toolNames: input.toolNames,
          },
        },
        select: { id: true },
      });
      return run.id;
    } catch (error) {
      this.logger.warn(
        `Failed to start AgentRun for brain: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  async complete(
    runId: string | undefined,
    result: {
      answer: string;
      provider: string;
      model: string;
      toolCalls: ToolLoopToolTrace[];
      rounds: number;
      promptTokens?: number;
      outputTokens?: number;
    },
  ): Promise<void> {
    if (!runId) return;
    try {
      const payload = {
        answer: result.answer,
        toolCalls: result.toolCalls,
        rounds: result.rounds,
      };
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: AgentRunStatus.SUCCEEDED,
          completedAt: new Date(),
          modelProvider: result.provider,
          model: result.model,
          promptTokens: result.promptTokens ?? null,
          outputTokens: result.outputTokens ?? null,
          result: boundJsonForStorage(payload, MAX_RESULT_JSON_CHARS),
          errorCode: null,
          errorMessage: null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to complete AgentRun ${runId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async fail(runId: string | undefined, error: unknown): Promise<void> {
    if (!runId) return;
    try {
      const message =
        error instanceof Error ? error.message : 'Brain request failed.';
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: AgentRunStatus.FAILED,
          completedAt: new Date(),
          errorCode: 'BRAIN_FAILED',
          errorMessage: message.slice(0, 2000),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to mark AgentRun ${runId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
