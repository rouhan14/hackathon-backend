import { Injectable } from '@nestjs/common';

@Injectable()
export class NotionService {
  getHello(): string {
    return 'Hello from the Notion integration!';
  }
}
