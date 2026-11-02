import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import { AnalysisStatus } from '../enums/analysis-status.enum';

const ANALYSIS_STATUSES = Object.values(AnalysisStatus);

export class ListAnalysesQueryDto {
  @IsOptional()
  @IsIn(ANALYSIS_STATUSES)
  status?: AnalysisStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
