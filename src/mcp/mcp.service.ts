import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ListToolsResult } from '@modelcontextprotocol/sdk/types.js';

type CallToolResult = Awaited<ReturnType<Client['callTool']>>;

export interface McpConnectionOptions {
  headers?: Record<string, string>;
}

export class McpConnection {
  constructor(
    private readonly client: Client,
    private readonly logger: Logger,
  ) {}

  listTools(): Promise<ListToolsResult> {
    return this.client.listTools();
  }

  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return this.client.callTool({ name, arguments: args });
  }

  async disconnect(): Promise<void> {
    await this.client.close();
    this.logger.log('MCP connection disconnected');
  }
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private client?: Client;
  private connected = false;

  constructor(private readonly configService: ConfigService) { }

  async connect(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }

    const serverUrl = this.configService.get<string>('MCP_SERVER_URL');
    const authToken = this.configService.get<string>('MCP_AUTH_TOKEN');

    if (!serverUrl) {
      throw new Error('MCP_SERVER_URL is not configured');
    }

    if (!authToken) {
      throw new Error('MCP_AUTH_TOKEN is not configured');
    }

    this.logger.log(`Starting MCP connection to ${serverUrl}`);

    const client = new Client({ name: 'backend-mcp-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    });

    try {
      await client.connect(transport);
      transport.onclose = () => {
        this.connected = false;
      };
      this.client = client;
      this.connected = true;
      this.logger.log('MCP connection successful');
    } catch (error) {
      this.connected = false;
      this.client = undefined;
      this.logger.error('MCP connection failed', this.errorMessage(error));
      throw new Error(
        `Failed to connect to MCP server at ${serverUrl}: ${this.errorMessage(error)}`,
        { cause: error },
      );
    }
  }

  async openConnection(options: McpConnectionOptions = {}): Promise<McpConnection> {
    const serverUrl = this.configService.get<string>('MCP_SERVER_URL');
    const authToken = this.configService.get<string>('MCP_AUTH_TOKEN');
    if (!serverUrl) throw new Error('MCP_SERVER_URL is not configured');
    if (!authToken) throw new Error('MCP_AUTH_TOKEN is not configured');

    this.logger.log(`Starting MCP connection to ${serverUrl}`);
    const client = new Client({ name: 'backend-mcp-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${authToken}`,
          ...options.headers,
        },
      },
    });
    try {
      await client.connect(transport);
      this.logger.log('MCP connection successful');
      return new McpConnection(client, this.logger);
    } catch (error) {
      this.logger.error('MCP connection failed', this.errorMessage(error));
      throw new Error(
        `Failed to connect to MCP server at ${serverUrl}: ${this.errorMessage(error)}`,
        { cause: error },
      );
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.close();
      this.logger.log('MCP connection disconnected');
    } finally {
      this.client = undefined;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listTools(): Promise<ListToolsResult> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client is not connected');
    }

    const result = await this.client.listTools();
    this.logger.log(`MCP tools listed: ${result.tools.length}`);
    return result;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    if (!this.client || !this.connected) {
      throw new Error('MCP client is not connected');
    }

    return this.client.callTool({
      name,
      arguments: args,
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
