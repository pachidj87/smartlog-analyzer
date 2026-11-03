import {
  INDEX_DEFINITIONS,
  formatIndexCommands,
} from '../../src/api/src/db/indexes';

describe('MongoDB index definitions', () => {
  it('declares the read-path indexes for logs and analyses', () => {
    expect(INDEX_DEFINITIONS).toHaveLength(5);
    expect(INDEX_DEFINITIONS).toEqual(
      expect.arrayContaining([
        { collection: 'logs', name: 'timestamp_-1', keys: { timestamp: -1 } },
        {
          collection: 'logs',
          name: 'service_1_timestamp_-1',
          keys: { service: 1, timestamp: -1 },
        },
        {
          collection: 'logs',
          name: 'level_1_timestamp_-1',
          keys: { level: 1, timestamp: -1 },
        },
        {
          collection: 'analyses',
          name: 'status_1_createdAt_-1',
          keys: { status: 1, createdAt: -1 },
        },
        {
          collection: 'analyses',
          name: 'createdAt_-1',
          keys: { createdAt: -1 },
        },
      ]),
    );
  });

  it('formats the indexes for dry-run output', () => {
    const commands = formatIndexCommands(INDEX_DEFINITIONS);

    expect(commands).toHaveLength(5);
    expect(commands).toContain('logs.timestamp_-1');
    expect(commands).toContain('analyses.status_1_createdAt_-1');
  });
});
