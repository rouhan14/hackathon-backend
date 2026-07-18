import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActionsModule } from './actions/actions.module';
import { AgentsModule } from './agents/agents.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AssistantModule } from './assistant/assistant.module';
import { ToolRegistryModule } from './assistant/tool-registry.module';
import { AuditModule } from './audit/audit.module';
import { ConnectionsModule } from './connections/connections.module';
import { ContextModule } from './context/context.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PolicyModule } from './policy/policy.module';
import { ProvidersModule } from './providers/providers.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ToolRegistryModule,
    InfrastructureModule,
    IdentityModule,
    ConnectionsModule,
    ProvidersModule,
    PolicyModule,
    ContextModule,
    SyncModule,
    AssistantModule,
    ActionsModule,
    AgentsModule,
    AuditModule,
    NotificationsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
