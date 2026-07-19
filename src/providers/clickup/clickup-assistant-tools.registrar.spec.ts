import { ProviderName } from '@prisma/client';
import { ToolRegistryService } from '../../assistant/tool-registry.service';
import {
  CLICKUP_GET_TASK_TOOL,
  CLICKUP_SEARCH_TOOL,
  ClickUpAssistantToolsRegistrar,
} from './clickup-assistant-tools.registrar';
import { ClickUpMcpService } from './clickup-mcp.service';

describe('ClickUpAssistantToolsRegistrar', () => {
  it('registers only controlled read tools', async () => {
    const registry = new ToolRegistryService();
    const searchTasks = jest.fn().mockResolvedValue({ tasks: [] });
    const getTask = jest.fn().mockResolvedValue({ task: {} });
    const registrar = new ClickUpAssistantToolsRegistrar(registry, {
      searchTasks,
      getTask,
    } as unknown as ClickUpMcpService);

    registrar.onModuleInit();

    expect(registry.list().map((tool) => tool.name)).toEqual([
      CLICKUP_SEARCH_TOOL,
      CLICKUP_GET_TASK_TOOL,
    ]);
    expect(
      registry.list().every((tool) => tool.provider === ProviderName.CLICKUP),
    ).toBe(true);
    expect(registry.has('clickup_delete_task')).toBe(false);

    await registry
      .get(CLICKUP_SEARCH_TOOL)
      .execute(
        { userId: 'user-1' },
        { connectionId: 'connection-1', query: 'blocked', limit: 5 },
      );
    expect(searchTasks).toHaveBeenCalledWith('user-1', 'connection-1', {
      query: 'blocked',
      limit: 5,
    });
  });
});
