import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CLICKUP_SEARCH_MAX_QUERY_LENGTH,
  CLICKUP_SEARCH_MAX_RESULTS,
} from '../clickup.constants';

export class ClickUpSearchDto {
  @ApiProperty({ example: 'tasks assigned to me that are blocked' })
  @IsString()
  @MinLength(1)
  @MaxLength(CLICKUP_SEARCH_MAX_QUERY_LENGTH)
  query: string;

  @ApiPropertyOptional({
    default: 10,
    minimum: 1,
    maximum: CLICKUP_SEARCH_MAX_RESULTS,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(CLICKUP_SEARCH_MAX_RESULTS)
  limit?: number;
}
