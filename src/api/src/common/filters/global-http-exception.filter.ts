import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { Request, Response } from 'express';

import { isClientSafeResponse } from '../errors';
import { isRecord } from '../validators';


@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const responseObject = isRecord(exceptionResponse)
      ? exceptionResponse
      : undefined;
    const clientSafe =
      responseObject !== undefined && isClientSafeResponse(exceptionResponse);
    const rawMessage = responseObject?.['message'] ?? exceptionResponse;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join('; ')
      : typeof rawMessage === 'string'
        ? rawMessage
        : 'Internal server error';
    const error =
      typeof responseObject?.['error'] === 'string'
        ? responseObject['error']
        : HttpStatus[status]?.replaceAll('_', ' ') ?? 'Internal Server Error';

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body = clientSafe
      ? {
          statusCode: status,
          ...responseObject,
          path: request.originalUrl,
          timestamp: new Date().toISOString(),
        }
      : {
          statusCode: status,
          error,
          message: status >= HttpStatus.INTERNAL_SERVER_ERROR
            ? 'Internal server error'
            : message,
          path: request.originalUrl,
          timestamp: new Date().toISOString(),
        };

    response.status(status).json(body);
  }
}
