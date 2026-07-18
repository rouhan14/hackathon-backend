import { Injectable, NotFoundException } from '@nestjs/common';
import { ActionRisk } from '@prisma/client';

export interface AssistantTool {
  name: string;
  description: string;
  risk: ActionRisk;
  requiredScopes: string[];
}

@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, AssistantTool>();

  register(tool: AssistantTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AssistantTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new NotFoundException(
        `Assistant tool "${name}" is not registered.`,
      );
    }
    return tool;
  }

  list(): AssistantTool[] {
    return [...this.tools.values()];
  }
}
