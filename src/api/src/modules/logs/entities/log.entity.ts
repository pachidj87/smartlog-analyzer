import { LogLevel } from '@nestjs/common';

import { ObjectId } from 'mongodb';
import { Column, Entity, ObjectIdColumn } from 'typeorm';

import { LogEntryInterface } from 'src/common/contracts';

@Entity('logs')
export class LogEntity implements LogEntryInterface {
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
