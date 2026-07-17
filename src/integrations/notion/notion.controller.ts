import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotionService } from './notion.service';

@ApiTags('notion')
@Controller('notion')
export class NotionController {
  constructor(private readonly notionService: NotionService) {}

  @Get('hello')
  getHello(): string {
    return this.notionService.getHello();
  }
}
