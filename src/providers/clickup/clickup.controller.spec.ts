import type { SafeUser } from '../../auth/auth.service';
import { ClickUpMcpService } from './clickup-mcp.service';
import { ClickUpController } from './clickup.controller';

describe('ClickUpController', () => {
  it('delegates task search with the authenticated user', async () => {
    const searchTasks = jest.fn().mockResolvedValue({ tasks: [] });
    const controller = new ClickUpController({
      searchTasks,
    } as unknown as ClickUpMcpService);

    await controller.search({ id: 'user-1' } as SafeUser, 'connection-1', {
      query: 'blocked',
      limit: 5,
    });

    expect(searchTasks).toHaveBeenCalledWith('user-1', 'connection-1', {
      query: 'blocked',
      limit: 5,
    });
  });

  it('delegates task retrieval with the authenticated user', async () => {
    const getTask = jest.fn().mockResolvedValue({ task: {} });
    const controller = new ClickUpController({
      getTask,
    } as unknown as ClickUpMcpService);

    await controller.getTask(
      { id: 'user-1' } as SafeUser,
      'connection-1',
      'task-1',
    );

    expect(getTask).toHaveBeenCalledWith('user-1', 'connection-1', 'task-1');
  });
});
