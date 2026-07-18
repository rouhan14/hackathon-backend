import { Module } from '@nestjs/common';
import { ActionsModule } from '../actions/actions.module';
import { AssistantModule } from '../assistant/assistant.module';
import { AgentsService } from './agents.service';

@Module({
  imports: [AssistantModule, ActionsModule],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
