import { ApiProperty } from '@nestjs/swagger';
import { ConnectionStatus, ProviderName } from '@prisma/client';

export class ConnectionEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ProviderName, example: ProviderName.NOTION })
  provider: ProviderName;

  @ApiProperty({ example: 'workspace-or-account-id' })
  accountId: string;

  @ApiProperty({ nullable: true, type: String })
  accountName: string | null;

  @ApiProperty({ nullable: true, type: String })
  workspaceId: string | null;

  @ApiProperty({ nullable: true, type: String })
  workspaceName: string | null;

  @ApiProperty({ enum: ConnectionStatus })
  status: ConnectionStatus;

  @ApiProperty({ type: [String] })
  grantedScopes: string[];

  @ApiProperty({ nullable: true, format: 'date-time' })
  lastSuccessfulSyncAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
