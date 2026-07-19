export interface ClickUpOAuthStateMetadata {
  clientInformationEncrypted?: string;
}

export interface ClickUpSearchToolBinding {
  name: string;
  queryArgument: string;
  limitArgument?: string;
}

export interface ClickUpGetTaskToolBinding {
  name: string;
  taskIdArgument: string;
}

export interface ClickUpToolBindings {
  search: ClickUpSearchToolBinding;
  getTask: ClickUpGetTaskToolBinding;
}

export interface ClickUpConnectionMetadata {
  mcpClientInformationEncrypted: string;
  tokenType?: string;
  toolBindings: ClickUpToolBindings;
}

export interface ClickUpAuthorizationResult {
  connected: true;
}

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
    [key: string]: unknown;
  };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  };
}
