import { LOG_LEVELS, LogLevel } from '@nestjs/common';

import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsOptional,
} from 'class-validator';


export class CreateLogDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'service must be a lowercase slug',
  })
  @MaxLength(63)
  service!: string;

  @IsDateString({ strict: true })
  timestamp!: string;

  @IsIn(LOG_LEVELS)
  level!: LogLevel;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  message!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
