import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsMongoId,
} from 'class-validator';

export class AnalyzeLogsDto {
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsMongoId({ each: true })
  logIds!: string[];
}
