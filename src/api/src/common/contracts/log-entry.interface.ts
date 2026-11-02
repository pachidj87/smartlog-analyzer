import { LogLevel } from "@nestjs/common";

export interface LogEntry {
  _id: unknown;

  service: string;

  timestamp: Date;

  level: LogLevel;

  message: string;

  metadata?: Record<string, unknown>;

  ingestedAt: Date;
}