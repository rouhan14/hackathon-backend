import { Injectable, OnModuleInit } from '@nestjs/common';
import { ActionRisk, ProviderName } from '@prisma/client';
import { ToolRegistryService } from '../../assistant/tool-registry.service';
import { ConnectionsService } from '../../connections/connections.service';
import { TokenVaultService } from '../../connections/token-vault.service';
import { McpService } from '../../mcp/mcp.service';

export const NOTION_SEARCH_TOOL = 'notion_search';
export const NOTION_READ_PAGE_TOOL = 'notion_read_page';
export const NOTION_CREATE_PAGE_TOOL = 'notion_create_page';

const MAX_NOTION_RESULT_CHARS = 12_000;

/**
 * Registers Notion read tools into the shared assistant tool registry so the
 * unified Gemma brain (/assistant/brain) can read Notion alongside Jira/ClickUp.
 *
 * Unlike Jira/ClickUp tools these do NOT take a connectionId — Notion is
 * addressed through the user's single active Notion connection, whose token is
 * passed to the hosted MCP server per call.
 */
@Injectable()
export class NotionAssistantToolsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly connections: ConnectionsService,
    private readonly tokenVault: TokenVaultService,
    private readonly mcp: McpService,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      name: NOTION_SEARCH_TOOL,
      provider: ProviderName.NOTION,
      description:
        'Search the user\'s Notion workspace for pages and data sources by title/keywords. Returns matching pages with their page_id. Does not require a connectionId.',
      risk: ActionRisk.READ,
      requiredScopes: [],
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Text to search Notion page titles for.',
          },
          page_size: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
            description: 'Maximum results to return. Default 10.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
      execute: (ctx, args) =>
        this.callNotion(ctx.userId, 'API-post-search', {
          query: requiredString(args.query, 'query'),
          page_size: optionalInteger(args.page_size, 1, 50, 'page_size') ?? 10,
        }),
    });

    this.registry.register({
      name: NOTION_READ_PAGE_TOOL,
      provider: ProviderName.NOTION,
      description:
        'Read the full content of a Notion page as Markdown. Pass the page_id returned by notion_search. Does not require a connectionId.',
      risk: ActionRisk.READ,
      requiredScopes: [],
      parameters: {
        type: 'object',
        properties: {
          page_id: {
            type: 'string',
            description: 'Notion page ID (from notion_search results).',
          },
        },
        required: ['page_id'],
        additionalProperties: false,
      },
      execute: (ctx, args) =>
        this.callNotion(ctx.userId, 'API-retrieve-page-markdown', {
          page_id: requiredString(args.page_id, 'page_id'),
        }),
    });

    this.registry.register({
      name: NOTION_CREATE_PAGE_TOOL,
      provider: ProviderName.NOTION,
      description:
        'Create a new Notion page as a child of an existing page. Provide the parent page_id (from notion_search), a title, and optional text content. Does not require a connectionId.',
      risk: ActionRisk.WRITE,
      requiredScopes: [],
      parameters: {
        type: 'object',
        properties: {
          parent_page_id: {
            type: 'string',
            description:
              'page_id of the parent Notion page (from notion_search) the new page is created under.',
          },
          title: {
            type: 'string',
            description: 'Title of the new page.',
          },
          content: {
            type: 'string',
            description: 'Optional page body text (plain text / short markdown).',
          },
        },
        required: ['parent_page_id', 'title'],
        additionalProperties: false,
      },
      execute: (ctx, args) =>
        this.callNotion(
          ctx.userId,
          'API-post-page',
          buildCreatePageArgs(
            requiredString(args.parent_page_id, 'parent_page_id'),
            requiredString(args.title, 'title'),
            typeof args.content === 'string' ? args.content : undefined,
          ),
        ),
    });
  }

  /** Open a per-user Notion MCP connection, call one tool, and disconnect. */
  private async callNotion(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const credential = await this.connections.findActiveProviderCredential(
      userId,
      ProviderName.NOTION,
    );
    const notionToken = this.tokenVault.decrypt(credential.accessTokenEncrypted);
    const connection = await this.mcp.openConnection({
      headers: { 'Notion-Token': notionToken },
    });
    try {
      const result = await connection.callTool(toolName, args);
      return extractNotionPayload(result);
    } finally {
      await connection.disconnect().catch(() => undefined);
    }
  }
}

/** Build Notion API-post-page arguments for a titled page under a parent page. */
function buildCreatePageArgs(
  parentPageId: string,
  title: string,
  content: string | undefined,
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    parent: { page_id: parentPageId },
    properties: {
      title: { title: [{ text: { content: title.slice(0, 2000) } }] },
    },
  };
  const body = content?.trim();
  if (body) {
    // Split into <=2000 char paragraph blocks (Notion rich_text limit).
    const chunks = body.match(/[\s\S]{1,1900}/g) ?? [];
    args.children = chunks.map((chunk) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: chunk } }] },
    }));
  }
  return args;
}

function extractNotionPayload(result: unknown): unknown {
  if (!isRecord(result)) {
    return result;
  }
  if (result.isError) {
    throw new Error(notionErrorText(result) || 'Notion tool returned an error.');
  }
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  if (Array.isArray(result.content)) {
    const text = result.content
      .filter(
        (block): block is { text: string } =>
          isRecord(block) && typeof block.text === 'string',
      )
      .map((block) => block.text)
      .join('\n')
      .trim();
    if (text) {
      return text.length > MAX_NOTION_RESULT_CHARS
        ? `${text.slice(0, MAX_NOTION_RESULT_CHARS)}\n[Notion content truncated]`
        : text;
    }
  }
  return result;
}

function notionErrorText(result: Record<string, unknown>): string {
  if (Array.isArray(result.content)) {
    return result.content
      .filter(
        (block): block is { text: string } =>
          isRecord(block) && typeof block.text === 'string',
      )
      .map((block) => block.text)
      .join(' ')
      .trim();
  }
  return typeof result.message === 'string' ? result.message : '';
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalInteger(
  value: unknown,
  min: number,
  max: number,
  field: string,
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
