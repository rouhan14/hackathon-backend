import type { ToolModelDefinition } from './model-provider';

/**
 * Tools exposed to the model for interacting with Notion.
 * The MCP server remains the source of truth and validates arguments before executing each tool.
 * 
 * Includes both read-only and write operations (create/update pages).
 */
export const NOTION_ASSISTANT_TOOLS: ToolModelDefinition[] = [
  // Read-only tools
  {
    name: 'API-post-search',
    description: 'Search Notion pages and data sources by title.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to search for.' },
        page_size: { type: 'integer', minimum: 1, maximum: 100 },
        start_cursor: { type: 'string' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'API-retrieve-a-page',
    description: 'Retrieve the metadata and properties of a Notion page.',
    inputSchema: {
      type: 'object',
      properties: { page_id: { type: 'string', description: 'Notion page ID.' } },
      required: ['page_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'API-retrieve-page-markdown',
    description: 'Read the content of a Notion page as Markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'Notion page ID.' },
        include_transcript: { type: 'boolean' },
      },
      required: ['page_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'API-query-data-source',
    description: 'Query a Notion data source when its ID is known.',
    inputSchema: {
      type: 'object',
      properties: {
        data_source_id: { type: 'string', description: 'Notion data source ID.' },
        filter: { type: 'object', additionalProperties: true },
        sorts: { type: 'array', items: { type: 'object', additionalProperties: true } },
        page_size: { type: 'integer', minimum: 1, maximum: 100 },
        start_cursor: { type: 'string' },
      },
      required: ['data_source_id'],
      additionalProperties: false,
    },
  },
  
  // Write operations - Create pages
  {
    name: 'API-post-page',
    description: 'Create a new page in Notion. Can create a page as a child of another page or in a database.',
    inputSchema: {
      type: 'object',
      properties: {
        parent: {
          type: 'object',
          description: 'The parent page or database where the page will be created.',
          properties: {
            page_id: { type: 'string', description: 'Parent page ID.' },
            database_id: { type: 'string', description: 'Parent database ID.' },
            data_source_id: { type: 'string', description: 'Parent data source ID.' },
          },
        },
        properties: {
          type: 'object',
          description: 'Page properties (title, etc.). Structure depends on parent type.',
          additionalProperties: true,
        },
        children: {
          type: 'array',
          description: 'Array of block objects to add as page content.',
          items: { type: 'object', additionalProperties: true },
        },
        icon: {
          type: 'object',
          description: 'Page icon (emoji or external file).',
          additionalProperties: true,
        },
        cover: {
          type: 'object',
          description: 'Page cover image.',
          additionalProperties: true,
        },
      },
      required: ['parent', 'properties'],
      additionalProperties: false,
    },
  },
  
  // Write operations - Update pages
  {
    name: 'API-patch-page',
    description: 'Update properties and metadata of an existing Notion page (title, icon, cover, archived status).',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'ID of the page to update.' },
        properties: {
          type: 'object',
          description: 'Page properties to update.',
          additionalProperties: true,
        },
        icon: {
          type: 'object',
          description: 'Update page icon.',
          additionalProperties: true,
        },
        cover: {
          type: 'object',
          description: 'Update page cover.',
          additionalProperties: true,
        },
        archived: {
          type: 'boolean',
          description: 'Archive or restore the page.',
        },
      },
      required: ['page_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'API-patch-page-markdown',
    description: 'Update the content of a Notion page using Markdown. Supports replacing entire content or targeted find-and-replace updates.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'ID of the page to update.' },
        replace_content: {
          type: 'string',
          description: 'New markdown content to replace the entire page body.',
        },
        update_content: {
          type: 'object',
          description: 'Targeted find-and-replace update.',
          properties: {
            find: { type: 'string', description: 'Text to find.' },
            replace_with: { type: 'string', description: 'Text to replace with.' },
          },
        },
      },
      required: ['page_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'API-patch-block-children',
    description: 'Append new content blocks to an existing Notion page or block. Use this to add content to pages without replacing existing content.',
    inputSchema: {
      type: 'object',
      properties: {
        block_id: {
          type: 'string',
          description: 'ID of the parent block or page to append children to.',
        },
        children: {
          type: 'array',
          description: 'Array of block objects to append as children.',
          items: { type: 'object', additionalProperties: true },
        },
      },
      required: ['block_id', 'children'],
      additionalProperties: false,
    },
  },
];
