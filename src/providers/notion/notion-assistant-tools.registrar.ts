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
        "Search the user's Notion workspace for pages and data sources by title/keywords. Returns matching pages with their page_id. Does not require a connectionId.",
      risk: ActionRisk.READ,
      requiredScopes: [],
      requiresConnectionId: false,
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
          query:
            readString(args, ['query', 'q', 'search', 'text', 'title']) ?? '',
          page_size:
            readInt(args, ['page_size', 'pagesize', 'limit', 'size'], 1, 50) ??
            10,
        }),
    });

    this.registry.register({
      name: NOTION_READ_PAGE_TOOL,
      provider: ProviderName.NOTION,
      description:
        'Read the full content of a Notion page as Markdown. Pass the page_id returned by notion_search. Does not require a connectionId.',
      risk: ActionRisk.READ,
      requiredScopes: [],
      requiresConnectionId: false,
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
      execute: (ctx, args) => {
        const pageId = normalizePageId(
          readString(args, ['page_id', 'pageid', 'id', 'page', 'pageId']),
        );
        if (!pageId) {
          throw new Error('page_id must be a non-empty Notion page ID.');
        }
        return this.callNotion(ctx.userId, 'API-retrieve-page-markdown', {
          page_id: pageId,
        });
      },
    });

    this.registry.register({
      name: NOTION_CREATE_PAGE_TOOL,
      provider: ProviderName.NOTION,
      description:
        'Create a new Notion page as a child of an existing page. Provide the parent page_id (from notion_search), a title, and optional text content. Does not require a connectionId.',
      risk: ActionRisk.WRITE,
      requiredScopes: [],
      requiresConnectionId: false,
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
            description:
              'Optional page body text (plain text / short markdown).',
          },
        },
        required: ['parent_page_id', 'title'],
        additionalProperties: false,
      },
      execute: (ctx, args) => this.createPage(ctx.userId, args),
    });
  }

  private async createPage(
    userId: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const title =
      readString(args, ['title', 'name', 'page_title', 'pagetitle']) ??
      'Untitled';
    const content = readString(args, [
      'content',
      'text',
      'body',
      'description',
      'markdown',
    ]);

    // Resolve a parent, discarding values that are actually connection IDs —
    // weak models grab the connectionId UUID from the connections list.
    const connectionIds = new Set(
      (await this.connections.findAll(userId)).map((c) => c.id),
    );
    let parentId = normalizePageId(
      readString(args, [
        'parent_page_id',
        'parentpageid',
        'parent_id',
        'parentid',
        'page_id',
        'pageid',
        'parent',
        'id',
      ]) ?? nestedParentId(args),
    );
    if (parentId && connectionIds.has(parentId)) {
      parentId = undefined;
    }
    if (!parentId) {
      parentId = await this.findDefaultParentPageId(userId);
    }
    if (!parentId) {
      throw new Error(
        'No Notion parent page is shared with the integration. Open Notion, share a page with the integration, then try again.',
      );
    }

    try {
      return await this.callNotion(
        userId,
        'API-post-page',
        buildCreatePageArgs(parentId, title, content),
      );
    } catch (error) {
      // Supplied parent was invalid/not found — retry once under a real page.
      if (isParentNotFound(error)) {
        const fallback = await this.findDefaultParentPageId(userId);
        if (fallback && fallback !== parentId) {
          return this.callNotion(
            userId,
            'API-post-page',
            buildCreatePageArgs(fallback, title, content),
          );
        }
      }
      throw error;
    }
  }

  /** Best-effort: pick a page the integration can see to use as a parent. */
  private async findDefaultParentPageId(
    userId: string,
  ): Promise<string | undefined> {
    try {
      const result = await this.callNotion(userId, 'API-post-search', {
        query: '',
        page_size: 5,
      });
      return firstNotionPageId(result);
    } catch {
      return undefined;
    }
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
    const notionToken = this.tokenVault.decrypt(
      credential.accessTokenEncrypted,
    );
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

/**
 * Match an argument by any of several aliases, ignoring case and non-alphanumeric
 * characters — so weak models that emit "parent page_id" or "parentPageId"
 * instead of "parent_page_id" still resolve correctly.
 */
function readArg(
  args: Record<string, unknown>,
  aliases: readonly string[],
): unknown {
  const wanted = new Set(aliases.map(normalizeArgKey));
  for (const [key, value] of Object.entries(args)) {
    if (wanted.has(normalizeArgKey(key))) {
      return value;
    }
  }
  return undefined;
}

function readString(
  args: Record<string, unknown>,
  aliases: readonly string[],
): string | undefined {
  const value = readArg(args, aliases);
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
}

function readInt(
  args: Record<string, unknown>,
  aliases: readonly string[],
  min: number,
  max: number,
): number | undefined {
  const value = readArg(args, aliases);
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizeArgKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Pull a parent id out of a nested { parent: { page_id } } / { parent: "id" }. */
function nestedParentId(args: Record<string, unknown>): string | undefined {
  const parent = readArg(args, ['parent']);
  if (typeof parent === 'string') return parent;
  if (isRecord(parent)) {
    const inner =
      parent.page_id ?? parent.pageId ?? parent.id ?? parent.database_id;
    if (typeof inner === 'string') return inner;
  }
  return undefined;
}

/** Accept a raw id, a dashed UUID, or a Notion URL and return the 32-char id. */
function normalizePageId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/[0-9a-f]{32}|[0-9a-f-]{36}/i);
  return match ? match[0] : value.trim() || undefined;
}

/**
 * Best-effort extraction of a usable parent page id from a search payload.
 * Prefers an object explicitly typed as a page (not a database/data source),
 * so we don't try to nest a new page under a data source id.
 */
function firstNotionPageId(payload: unknown): string | undefined {
  const serialized = safeStringify(payload);
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

  // "object":"page", ... "id":"<uuid>"  (id after the type)
  const pageThenId = serialized.match(
    new RegExp(
      `"object"\\s*:\\s*"page"[\\s\\S]{0,300}?"id"\\s*:\\s*"(${uuid})"`,
      'i',
    ),
  );
  if (pageThenId) return pageThenId[1];

  // "id":"<uuid>", ... "object":"page"  (id before the type)
  const idThenPage = serialized.match(
    new RegExp(
      `"id"\\s*:\\s*"(${uuid})"[\\s\\S]{0,120}?"object"\\s*:\\s*"page"`,
      'i',
    ),
  );
  if (idThenPage) return idThenPage[1];

  // Fallback: first id of any kind.
  const anyId = serialized.match(new RegExp(`"id"\\s*:\\s*"(${uuid})"`, 'i'));
  return anyId?.[1];
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
    throw new Error(
      notionErrorText(result) || 'Notion tool returned an error.',
    );
  }

  const structured = result.structuredContent;
  const text = Array.isArray(result.content)
    ? result.content
        .filter(
          (block): block is { text: string } =>
            isRecord(block) && typeof block.text === 'string',
        )
        .map((block) => block.text)
        .join('\n')
        .trim()
    : '';

  // The Notion MCP sometimes returns an API error in a "successful" result
  // (no isError flag). Detect the error shape so callers see ok: false.
  const errorMessage = detectNotionError(
    structured !== undefined ? safeStringify(structured) : text,
  );
  if (errorMessage) {
    throw new Error(errorMessage);
  }

  if (structured !== undefined) {
    return structured;
  }
  if (text) {
    return text.length > MAX_NOTION_RESULT_CHARS
      ? `${text.slice(0, MAX_NOTION_RESULT_CHARS)}\n[Notion content truncated]`
      : text;
  }
  return result;
}

/** Detect a Notion API error embedded in an otherwise-"successful" payload. */
function detectNotionError(serialized: string): string | undefined {
  if (!serialized) return undefined;
  const isError =
    /"object"\s*:\s*"error"/i.test(serialized) ||
    /object_not_found/i.test(serialized) ||
    /validation_error/i.test(serialized) ||
    /could not find (?:the )?(?:page|block|database|data source)/i.test(
      serialized,
    );
  if (!isError) return undefined;
  const message = serialized.match(/"message"\s*:\s*"([^"]+)"/i);
  return message?.[1] ?? 'Notion could not complete the request.';
}

function isParentNotFound(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes('not find') ||
    message.includes('not found') ||
    message.includes('object_not_found') ||
    message.includes('validation')
  );
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
  } catch {
    return '';
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
