import { Controller, Delete, Get, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConnectionEntity } from './connection.entity';
import {
  ConnectionsService,
  DisconnectResult,
  SafeConnection,
} from './connections.service';

@ApiTags('integrations')
@Controller('integrations')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all stored integration connections (no access tokens).',
  })
  @ApiOkResponse({ type: [ConnectionEntity] })
  findAll(): Promise<SafeConnection[]> {
    return this.connectionsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one integration connection by id.' })
  @ApiOkResponse({ type: ConnectionEntity })
  @ApiNotFoundResponse({ description: 'Connection not found.' })
  findOne(@Param('id') id: string): Promise<SafeConnection> {
    return this.connectionsService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Disconnect an integration: revoke the token at the provider and delete the stored connection.',
  })
  @ApiOkResponse({
    schema: { example: { disconnected: true, revokedAtProvider: true } },
  })
  @ApiNotFoundResponse({ description: 'Connection not found.' })
  disconnect(@Param('id') id: string): Promise<DisconnectResult> {
    return this.connectionsService.disconnect(id);
  }
}
