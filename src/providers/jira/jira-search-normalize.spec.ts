import { normalizeJiraSearchResult } from './jira-search-normalize';

describe('normalizeJiraSearchResult', () => {
  it('extracts issues from a classic Jira REST-shaped payload inside MCP content', () => {
    const result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            total: 2,
            issues: [
              {
                key: 'WORK-1',
                fields: {
                  summary: 'Fix login',
                  status: { name: 'In Progress' },
                  assignee: { displayName: 'John' },
                  priority: { name: 'High' },
                  issuetype: { name: 'Bug' },
                  updated: '2026-07-18T10:00:00.000+0000',
                },
              },
              {
                key: 'WORK-2',
                fields: {
                  summary: 'Write docs',
                  status: { name: 'To Do' },
                  assignee: { displayName: 'John' },
                },
              },
            ],
          }),
        },
      ],
    };

    const normalized = normalizeJiraSearchResult({
      connectionId: 'c1',
      cloudId: 'cloud-1',
      jql: 'assignee = currentUser()',
      result,
    });

    expect(normalized.empty).toBe(false);
    expect(normalized.issueCount).toBe(2);
    expect(normalized.total).toBe(2);
    expect(normalized.issues[0]).toMatchObject({
      key: 'WORK-1',
      summary: 'Fix login',
      status: 'In Progress',
      assignee: 'John',
      priority: 'High',
      issueType: 'Bug',
    });
    expect(normalized.issues[1]?.key).toBe('WORK-2');
  });

  it('reports empty clearly when no issues are present', () => {
    const normalized = normalizeJiraSearchResult({
      connectionId: 'c1',
      cloudId: 'cloud-1',
      jql: 'assignee = currentUser()',
      result: {
        content: [
          { type: 'text', text: JSON.stringify({ issues: [], total: 0 }) },
        ],
      },
    });
    expect(normalized.empty).toBe(true);
    expect(normalized.issueCount).toBe(0);
    expect(normalized.note).toMatch(/No issues matched/i);
  });

  it('handles structuredContent wrapper', () => {
    const normalized = normalizeJiraSearchResult({
      connectionId: 'c1',
      cloudId: 'cloud-1',
      jql: 'x',
      result: {
        structuredContent: {
          issues: [{ key: 'ABC-9', summary: 'Ship it' }],
        },
      },
    });
    expect(normalized.issues).toEqual([{ key: 'ABC-9', summary: 'Ship it' }]);
  });
});
