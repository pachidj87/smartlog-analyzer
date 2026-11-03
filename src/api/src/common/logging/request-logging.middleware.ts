import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { JsonLoggerService } from './json-logger.service';

const REQUEST_ID_HEADER = 'x-request-id';

type RequestWithId = Request & { id?: string };

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: JsonLoggerService) {}

  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const requestId = this.inboundRequestId(req) ?? randomUUID();
    req.id = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const startedAt = process.hrtime.bigint();
    let logged = false;

    res.on('finish', () => {
      if (logged) {
        return;
      }
      logged = true;
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      this.logger.log({
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 1000) / 1000,
      });
    });

    next();
  }

  private inboundRequestId(req: RequestWithId): string | undefined {
    const header = req.headers[REQUEST_ID_HEADER];
    const value = Array.isArray(header) ? header[0] : header;
    const trimmed = value?.trim();

    return trimmed ? trimmed : undefined;
  }
}
