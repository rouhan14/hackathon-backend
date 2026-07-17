import { Controller, Get } from '@nestjs/common';
import { NotionService } from './notion.service';

@Controller('notion')
export class NotionController {
  constructor(private readonly notionService: NotionService) {}

  @Get('hello')
  getHello(): string {
    return this.notionService.getHello();
  }
}
