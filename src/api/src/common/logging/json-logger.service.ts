import { Injectable, LoggerService } from '@nestjs/common';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

const RESERVED_KEYS = new Set(['timestamp', 'level', 'context', 'message']);

/**
 * Dependency-free structured logger.
 *
 * Every entry is written as a single JSON line on stdout so container log
 * collectors can parse it without a multiline stack trace heuristic.
 */
@Injectable()
export class JsonLoggerService implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(
    level: LogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
    };

    this.assignMessage(entry, message);

    for (const param of optionalParams) {
      if (param instanceof Error) {
        entry.error = param.message;
        entry.stack = param.stack;
        continue;
      }
      if (typeof param === 'string') {
        if (entry.context === undefined) {
          entry.context = param;
        }
        continue;
      }
      if (param !== null && typeof param === 'object') {
        this.assignMeta(entry, param as Record<string, unknown>);
      }
    }

    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }

  private assignMessage(
    entry: Record<string, unknown>,
    message: unknown,
  ): void {
    if (typeof message === 'string') {
      entry.message = message;
      return;
    }
    if (message instanceof Error) {
      entry.message = message.message;
      entry.error = message.message;
      entry.stack = message.stack;
      return;
    }
    if (message !== null && typeof message === 'object') {
      this.assignMeta(entry, message as Record<string, unknown>);
      return;
    }
    entry.message = String(message);
  }

  private assignMeta(
    entry: Record<string, unknown>,
    meta: Record<string, unknown>,
  ): void {
    for (const [key, value] of Object.entries(meta)) {
      if (!RESERVED_KEYS.has(key) && value !== undefined) {
        entry[key] = value;
      }
    }
  }
}
