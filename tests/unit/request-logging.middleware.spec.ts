import { EventEmitter } from 'node:events';

import { RequestLoggingMiddleware } from '../../src/api/src/common/logging/request-logging.middleware';

interface FakeRequest {
  method: string;
  originalUrl: string;
  headers: Record<string, string>;
  id?: string;
}

describe('RequestLoggingMiddleware', () => {
  const buildResponse = () => {
    const response = new EventEmitter() as EventEmitter & {
      statusCode: number;
      setHeader: jest.Mock;
    };
    response.statusCode = 201;
    response.setHeader = jest.fn();
    return response;
  };

  it('reuses an inbound x-request-id and logs once the response finishes', () => {
    const logger = { log: jest.fn() };
    const middleware = new RequestLoggingMiddleware(logger as never);
    const request: FakeRequest = {
      method: 'POST',
      originalUrl: '/api/logs',
      headers: { 'x-request-id': 'req-123' },
    };
    const response = buildResponse();
    const next = jest.fn();

    middleware.use(request as never, response as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(request).toHaveProperty('id', 'req-123');
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'req-123');
    expect(logger.log).not.toHaveBeenCalled();

    response.emit('finish');

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-123',
        method: 'POST',
        path: '/api/logs',
        status: 201,
        durationMs: expect.any(Number),
      }),
    );
  });

  it('generates a request id when the header is absent', () => {
    const logger = { log: jest.fn() };
    const middleware = new RequestLoggingMiddleware(logger as never);
    const request: FakeRequest = {
      method: 'GET',
      originalUrl: '/api/health/live',
      headers: {},
    };
    const response = buildResponse();

    middleware.use(request as never, response as never, jest.fn());

    expect(request.id).toEqual(expect.any(String));
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', request.id);
  });
});
