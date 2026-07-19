import {
  normalizeClickUpSearchResult,
  normalizeClickUpTaskResult,
} from './clickup-normalize';

describe('ClickUp response normalization', () => {
  it('normalizes structured task search content', () => {
    const result = normalizeClickUpSearchResult({
      connectionId: 'connection-1',
      query: 'blocked',
      result: {
        structuredContent: {
          tasks: [
            {
              id: 'task-1',
              name: 'Fix OAuth callback',
              status: { status: 'blocked' },
              assignees: [{ username: 'Ahmad' }],
              priority: { priority: 'high' },
              due_date: '1767225600000',
              date_updated: '1767139200000',
              url: 'https://app.clickup.com/t/task-1',
              list: { name: 'Backend' },
            },
          ],
        },
      },
    });

    expect(result).toMatchObject({
      connectionId: 'connection-1',
      query: 'blocked',
      taskCount: 1,
      empty: false,
      tasks: [
        {
          id: 'task-1',
          name: 'Fix OAuth callback',
          status: 'blocked',
          assignees: ['Ahmad'],
          priority: 'high',
          listName: 'Backend',
        },
      ],
    });
  });

  it('parses JSON text content and respects the requested limit', () => {
    const tasks = Array.from({ length: 30 }, (_, index) => ({
      id: `task-${index}`,
      name: `Task ${index}`,
      type: 'task',
    }));
    const result = normalizeClickUpSearchResult({
      connectionId: 'connection-1',
      query: 'task',
      limit: 3,
      result: {
        content: [{ type: 'text', text: JSON.stringify({ tasks }) }],
      },
    });

    expect(result.taskCount).toBe(3);
    expect(result.tasks).toHaveLength(3);
  });

  it('returns an explicit empty result for unrelated workspace items', () => {
    const result = normalizeClickUpSearchResult({
      connectionId: 'connection-1',
      query: 'marketing',
      result: {
        structuredContent: {
          items: [{ id: 'list-1', name: 'Marketing', type: 'list' }],
        },
      },
    });

    expect(result).toMatchObject({ taskCount: 0, tasks: [], empty: true });
    expect(result.note).toBeDefined();
  });

  it('normalizes one task response', () => {
    expect(
      normalizeClickUpTaskResult({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              id: 'task-2',
              name: 'Review release',
              status: 'in progress',
              assignees: ['Rouhan'],
            }),
          },
        ],
      }),
    ).toMatchObject({
      id: 'task-2',
      name: 'Review release',
      status: 'in progress',
      assignees: ['Rouhan'],
    });
  });
});
