import { Module } from '@nestjs/common';
import { PolicyModule } from '../policy/policy.module';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [PolicyModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
