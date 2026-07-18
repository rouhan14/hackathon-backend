import {
  buildDefaultToolCalls,
  extractJiraConnectionId,
} from './default-tool-calls';

describe('extractJiraConnectionId', () => {
  it('reads id from a JIRA connection line', () => {
    const instructions = `
Available connections:
- id=ae8aac0e-068e-4e65-8859-555e998cb25c; provider=JIRA; workspace=ahmadsworkspace; status=ACTIVE
`;
    expect(extractJiraConnectionId(instructions)).toBe(
      'ae8aac0e-068e-4e65-8859-555e998cb25c',
    );
  });
});

describe('buildDefaultToolCalls', () => {
  it('builds jira_search with connection id and safe JQL', () => {
    const calls = buildDefaultToolCalls(
      [
        {
          name: 'jira_search',
          description: 'Search',
          parameters: {},
        },
      ],
      '- id=ae8aac0e-068e-4e65-8859-555e998cb25c; provider=JIRA; workspace=Acme',
    );
    expect(calls).toEqual([
      {
        name: 'jira_search',
        arguments: {
          connectionId: 'ae8aac0e-068e-4e65-8859-555e998cb25c',
          jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
          maxResults: 15,
        },
      },
    ]);
  });
});
