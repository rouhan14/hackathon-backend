import { ActionRisk, ConnectionStatus, ProviderName } from '@prisma/client';
import {
  filterToolsForConnections,
  type AssistantTool,
  ToolRegistryService,
} from './tool-registry.service';

function tool(name: string, provider: ProviderName): AssistantTool {
  return {
    name,
    provider,
    description: `${name} tool`,
    risk: ActionRisk.READ,
    requiredScopes: [],
    parameters: { type: 'object', properties: {} },
    execute: () => Promise.resolve({}),
  };
}

describe('filterToolsForConnections', () => {
  const jiraSearch = tool('jira_search', ProviderName.JIRA);
  const gmailSearch = tool('gmail_search', ProviderName.GMAIL);

  it('offers only tools for connected usable providers', () => {
    const offered = filterToolsForConnections(
      [jiraSearch, gmailSearch],
      [
        {
          provider: ProviderName.JIRA,
          status: ConnectionStatus.ACTIVE,
        },
      ],
    );
    expect(offered.map((t) => t.name)).toEqual(['jira_search']);
  });

  it('offers no tools without usable connections', () => {
    expect(
      filterToolsForConnections(
        [jiraSearch],
        [
          {
            provider: ProviderName.JIRA,
            status: ConnectionStatus.REAUTH_REQUIRED,
          },
        ],
      ),
    ).toEqual([]);
  });

  it('offers a second provider tool without orchestrator naming it when connected', () => {
    const offered = filterToolsForConnections(
      [jiraSearch, gmailSearch],
      [
        {
          provider: ProviderName.GMAIL,
          status: ConnectionStatus.ACTIVE,
        },
      ],
    );
    expect(offered.map((t) => t.name)).toEqual(['gmail_search']);
  });
});

describe('ToolRegistryService.listForConnections', () => {
  it('filters registered tools by connection providers', () => {
    const registry = new ToolRegistryService();
    registry.register(tool('jira_search', ProviderName.JIRA));
    registry.register(tool('gmail_search', ProviderName.GMAIL));

    const offered = registry.listForConnections([
      {
        provider: ProviderName.JIRA,
        status: ConnectionStatus.DEGRADED,
      },
    ]);
    expect(offered.map((t) => t.name)).toEqual(['jira_search']);
  });
});
