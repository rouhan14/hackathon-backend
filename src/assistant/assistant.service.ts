// Re-export both assistant services for backward compatibility
export {
  BrainAssistantService,
  buildAssistantInstructions,
} from './brain-assistant.service';
export type { AssistantAskResult } from './brain-assistant.service';
export { NotionAssistantService } from './notion-assistant.service';
