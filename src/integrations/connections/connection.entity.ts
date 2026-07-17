import { ApiProperty } from '@nestjs/swagger';

/** Swagger response shape for an integration connection (no access token). */
export class ConnectionEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'notion' })
  provider: string;

  @ApiProperty({ nullable: true, type: String })
  workspaceId: string | null;

  @ApiProperty({ nullable: true, type: String, example: "Rouhan's Notion" })
  workspaceName: string | null;

  @ApiProperty({ nullable: true, type: String })
  botId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
