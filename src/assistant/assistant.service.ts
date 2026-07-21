// Re-export both assistant services for backward compatibility
export { JiraAssistantService, buildAssistantInstructions } from './jira-assistant.service';
export type { AssistantAskResult } from './jira-assistant.service';
export { NotionAssistantService } from './notion-assistant.service';
