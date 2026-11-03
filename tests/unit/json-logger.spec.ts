import { JsonLoggerService } from '../../src/api/src/common/logging/json-logger.service';

describe('JsonLoggerService', () => {
  let write: jest.SpyInstance;

  beforeEach(() => {
    write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes one parseable JSON line with level and context', () => {
    const logger = new JsonLoggerService();

    logger.log('service started', 'Bootstrap');

    expect(write).toHaveBeenCalledTimes(1);
    const line = String(write.mock.calls[0][0]).trim();
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual(
      expect.objectContaining({
        level: 'log',
        context: 'Bootstrap',
        message: 'service started',
        timestamp: expect.any(String),
      }),
    );
  });

  it('serializes errors and merges structured metadata', () => {
    const logger = new JsonLoggerService();

    logger.error('request failed', new Error('boom'));

    const payload = JSON.parse(String(write.mock.calls[0][0]));
    expect(payload).toEqual(
      expect.objectContaining({
        level: 'error',
        message: 'request failed',
        error: 'boom',
      }),
    );
  });
});
