import { ObjectId } from 'mongodb';
import { Column, Entity, ObjectIdColumn } from 'typeorm';

import type { LogLevel } from '../log-level.enum';
import { LogEntry } from 'src/common/contracts';

@Entity('logs')
export class LogEntity implements LogEntry {
  @ObjectIdColumn()
  _id!: ObjectId;

  @Column()
  service!: string;

  @Column()
  timestamp!: Date;

  @Column()
  level!: LogLevel;

  @Column()
  message!: string;

  @Column()
  metadata?: Record<string, unknown>;

  @Column()
  ingestedAt!: Date;
}
