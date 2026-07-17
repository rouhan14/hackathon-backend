import { NotionService } from './notion.service';
export declare class NotionController {
    private readonly notionService;
    constructor(notionService: NotionService);
    getHello(): string;
}
