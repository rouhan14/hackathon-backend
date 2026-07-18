import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AskDto {
  @ApiProperty({
    example: 'What open Jira bugs am I assigned to?',
    description: 'Natural-language work question for the assistant.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;
}
