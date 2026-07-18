import {
  looksLikePseudoToolNarration,
  parsePseudoToolCalls,
} from './parse-pseudo-tool-calls';

describe('parsePseudoToolCalls', () => {
  it('parses a function-style call containing a JSON argument object', () => {
    expect(
      parsePseudoToolCalls(
        'jira_search({"connectionId":"c1","jql":"project = APP"})',
        ['jira_search'],
      ),
    ).toEqual([
      {
        name: 'jira_search',
        arguments: { connectionId: 'c1', jql: 'project = APP' },
      },
    ]);
  });

  it('parses jira_search(...) written as plain text', () => {
    const text = `
Okay, John. I'll use the Jira tool.

\`\`\`tool_code
jira_search(connectionId='ae8aac0e-068e-4e65-8859-555e998cb25c', jql='true')
\`\`\`
`;
    const calls = parsePseudoToolCalls(text, ['jira_search']);
    expect(calls).toEqual([
      {
        name: 'jira_search',
        arguments: {
          connectionId: 'ae8aac0e-068e-4e65-8859-555e998cb25c',
          jql: 'true',
        },
      },
    ]);
  });

  it('ignores unknown function names', () => {
    expect(
      parsePseudoToolCalls('print("hi") and foo(bar=1)', ['jira_search']),
    ).toEqual([]);
  });

  it('parses double-quoted kwargs', () => {
    const calls = parsePseudoToolCalls(
      `jira_search(connectionId="c1", jql="assignee = currentUser()")`,
      ['jira_search'],
    );
    expect(calls[0]?.arguments).toEqual({
      connectionId: 'c1',
      jql: 'assignee = currentUser()',
    });
  });
});

describe('looksLikePseudoToolNarration', () => {
  it('detects tool_code and jira_search narration', () => {
    expect(
      looksLikePseudoToolNarration("I'll use the Jira tool to check"),
    ).toBe(true);
    expect(looksLikePseudoToolNarration('```tool_code\nfoo\n```')).toBe(true);
    expect(looksLikePseudoToolNarration('You have 2 open bugs.')).toBe(false);
  });
});
