import { IsMongoId } from 'class-validator';

export class AnalysisIdParamDto {
  @IsMongoId()
  id!: string;
}
