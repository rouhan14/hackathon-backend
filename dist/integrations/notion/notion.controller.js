"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotionController = void 0;
const common_1 = require("@nestjs/common");
const notion_service_1 = require("./notion.service");
let NotionController = class NotionController {
    notionService;
    constructor(notionService) {
        this.notionService = notionService;
    }
    getHello() {
        return this.notionService.getHello();
    }
};
exports.NotionController = NotionController;
__decorate([
    (0, common_1.Get)('hello'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], NotionController.prototype, "getHello", null);
exports.NotionController = NotionController = __decorate([
    (0, common_1.Controller)('notion'),
    __metadata("design:paramtypes", [notion_service_1.NotionService])
], NotionController);
//# sourceMappingURL=notion.controller.js.map