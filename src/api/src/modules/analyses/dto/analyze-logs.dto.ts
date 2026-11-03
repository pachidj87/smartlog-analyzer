import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsOptional,
  IsMongoId,
  IsString,
  MaxLength,
} from 'class-validator';

export class AnalyzeLogsDto {
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsMongoId({ each: true })
  logIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  prompt?: string;
}
