import { Module } from '@nestjs/common';
import { PolicyModule } from '../policy/policy.module';
import { ProvidersModule } from '../providers/providers.module';
import { ActionsService } from './actions.service';

@Module({
  imports: [PolicyModule, ProvidersModule],
  providers: [ActionsService],
  exports: [ActionsService],
})
export class ActionsModule {}
