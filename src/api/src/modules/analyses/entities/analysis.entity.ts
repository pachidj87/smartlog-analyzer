import { ObjectId } from 'mongodb';
import { Column, Entity, ObjectIdColumn } from 'typeorm';

import { AnalysisStatus } from '../enums';
import { AnalysisResult } from '../contracts';

@Entity('analyses')
export class AnalysisEntity {
  @ObjectIdColumn()
  _id!: ObjectId;

  @Column()
  logIds!: string[];

  @Column()
  status!: AnalysisStatus;

  @Column()
  provider?: string;

  @Column()
  result?: AnalysisResult;

  @Column()
  error?: string;

  @Column()
  attempts!: number;

  @Column()
  createdAt!: Date;

  @Column()
  updatedAt!: Date;
}
