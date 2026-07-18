import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConnectionEntity } from '../connections/connection.entity';
import {
  ConnectionsService,
  SafeConnection,
} from '../connections/connections.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { SafeUser } from '../auth/auth.service';
import {
  DisconnectResult,
  ProviderConnectionsService,
} from './provider-connections.service';

@ApiTags('integrations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('integrations')
export class ProviderConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly providerConnections: ProviderConnectionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List the current user's integration connections." })
  @ApiOkResponse({ type: [ConnectionEntity] })
  findAll(@CurrentUser() user: SafeUser): Promise<SafeConnection[]> {
    return this.connections.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: "Get one of the current user's connections." })
  @ApiOkResponse({ type: ConnectionEntity })
  @ApiNotFoundResponse({ description: 'Connection not found.' })
  findOne(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
  ): Promise<SafeConnection> {
    return this.connections.findOne(user.id, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke and remove an owned connection.' })
  @ApiOkResponse({
    schema: { example: { disconnected: true, revokedAtProvider: true } },
  })
  disconnect(
    @CurrentUser() user: SafeUser,
    @Param('id') id: string,
  ): Promise<DisconnectResult> {
    return this.providerConnections.disconnect(user.id, id);
  }
}
