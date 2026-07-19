import { Injectable } from '@nestjs/common';
import type { ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { McpService } from '../../mcp/mcp.service';

type CallToolResult = Awaited<ReturnType<McpService['callTool']>>;

@Injectable()
export class NotionMcpService {
  constructor(private readonly mcp: McpService) {}

  async listTools(): Promise<ListToolsResult> {
    await this.ensureConnected();
    return this.mcp.listTools();
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    await this.ensureConnected();
    return this.mcp.callTool(name, args);
  }

  private async ensureConnected(): Promise<void> {
    if (!this.mcp.isConnected()) {
      await this.mcp.connect();
    }
  }
}
