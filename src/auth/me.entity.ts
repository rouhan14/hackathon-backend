import { ApiProperty } from '@nestjs/swagger';
import { ConnectionEntity } from '../integrations/connections/connection.entity';

/** Swagger response shape for GET /auth/me: the user plus their integrations. */
export class MeEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ nullable: true, type: String })
  name: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ type: [ConnectionEntity] })
  integrations: ConnectionEntity[];
}
