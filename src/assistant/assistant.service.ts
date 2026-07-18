import { Inject, Injectable } from '@nestjs/common';
import { McpService } from '../mcp/mcp.service';
import { ConnectionsService } from '../connections/connections.service';
import { TokenVaultService } from '../connections/token-vault.service';
import { ProviderName } from '@prisma/client';
import { MODEL_PROVIDER } from './model-provider';
import type { ModelProvider, ToolModelMessage } from './model-provider';
import { NOTION_ASSISTANT_TOOLS } from './notion-assistant-tools';

const MAX_TOOL_RESULT_CHARS = 6_000;

@Injectable()
export class AssistantService {
  constructor(
    @Inject(MODEL_PROVIDER) private readonly model: ModelProvider,
    private readonly mcp: McpService,
    private readonly connections: ConnectionsService,
    private readonly tokenVault: TokenVaultService,
  ) {}

  async chat(userId: string, message: string): Promise<{ message: string }> {
    const credential = await this.connections.findActiveProviderCredential(
      userId,
      ProviderName.NOTION,
    );
    const notionToken = this.tokenVault.decrypt(credential.accessTokenEncrypted);
    const connection = await this.mcp.openConnection({
      headers: { 'Notion-Token': notionToken },
    });
    try {
      return await this.chatWithConnection(message, connection);
    } finally {
      await connection.disconnect();
    }
  }

  private async chatWithConnection(
    message: string,
    connection: Awaited<ReturnType<McpService['openConnection']>>,
  ): Promise<{ message: string }> {
    const messages: ToolModelMessage[] = [{ role: 'user', content: message }];

    for (let round = 0; round < 5; round += 1) {
      const result = await this.model.generateWithTools({
        instructions:
          'You are a helpful Notion assistant. Use tools only when needed and never invent tool results. You can read, create, and update Notion pages. When creating or updating pages, always confirm the action was successful by checking the response.',
        messages,
        tools: NOTION_ASSISTANT_TOOLS,
      });

      if (result.toolCalls.length === 0) {
        return { message: result.content };
      }

      messages.push({
        role: 'assistant',
        content: result.content,
        toolCalls: result.toolCalls,
      });
      for (const call of result.toolCalls) {
        const toolResult = await connection.callTool(call.name, call.arguments);
        messages.push({
          role: 'tool',
          content: this.compactToolResult(toolResult),
          toolCallId: call.id,
          toolName: call.name,
        });
      }
    }
    throw new Error('Assistant exceeded the maximum MCP tool-call rounds');
  }

  private compactToolResult(result: unknown): string {
    const serialized = JSON.stringify(result);
    if (serialized.length <= MAX_TOOL_RESULT_CHARS) return serialized;
    return `${serialized.slice(0, MAX_TOOL_RESULT_CHARS)}\n[Tool result truncated]`;
  }
}
