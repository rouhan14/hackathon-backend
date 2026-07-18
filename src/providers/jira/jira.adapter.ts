import { Injectable } from '@nestjs/common';
import { ProviderName } from '@prisma/client';
import { ProviderAdapter, ProviderCapabilities } from '../provider-adapter';

@Injectable()
export class JiraAdapter implements ProviderAdapter {
  readonly provider = ProviderName.JIRA;

  getCapabilities(): ProviderCapabilities {
    return {
      provider: this.provider,
      supportsLiveSearch: true,
      supportsIncrementalSync: false,
      supportsWebhooks: false,
      supportedActions: ['searchJiraIssuesUsingJql', 'getJiraIssue'],
    };
  }

  revoke(): Promise<boolean> {
    // Atlassian's hosted MCP OAuth discovery does not currently expose a
    // provider-neutral revocation helper through the MCP SDK. Local encrypted
    // credentials are still deleted when the user disconnects.
    return Promise.resolve(false);
  }
}
