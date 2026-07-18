import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { ProvidersModule } from '../providers/providers.module';
import { SyncCoordinatorService } from './sync-coordinator.service';

@Module({
  imports: [ProvidersModule, ContextModule],
  providers: [SyncCoordinatorService],
  exports: [SyncCoordinatorService],
})
export class SyncModule {}
