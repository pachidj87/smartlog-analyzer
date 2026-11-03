import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export const LOG_STATS_GROUP_BY = ['service', 'level'] as const;

export type LogStatsGroupBy = (typeof LOG_STATS_GROUP_BY)[number];

export class LogStatsQueryDto {
  @IsOptional()
  @IsIn(LOG_STATS_GROUP_BY)
  groupBy: LogStatsGroupBy = 'service';

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
