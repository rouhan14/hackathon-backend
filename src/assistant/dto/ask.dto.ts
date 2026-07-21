import { ProviderName } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AskDto {
  @ApiProperty({
    example: 'What open Jira bugs am I assigned to?',
    description: 'Natural-language work question for the assistant.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @ApiPropertyOptional({
    enum: ProviderName,
    isArray: true,
    example: [ProviderName.JIRA],
    description:
      'Optional hard filter. Only tools for these connected providers are offered to the model.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(ProviderName, { each: true })
  sources?: ProviderName[];
}
