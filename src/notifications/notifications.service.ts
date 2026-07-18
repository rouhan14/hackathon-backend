import { Injectable } from '@nestjs/common';
import { DeliveryChannel } from '@prisma/client';

export interface DeliveryRequest {
  reportId: string;
  channel: DeliveryChannel;
  recipient: string;
}

@Injectable()
export class NotificationsService {
  createDeliveryRequest(input: DeliveryRequest): DeliveryRequest {
    // Delivery providers are added after recipient authorization policy exists.
    return { ...input };
  }
}
