import { Db } from 'mongodb';

import { INDEX_DEFINITIONS } from '../indexes';

const LOG_INDEXES = INDEX_DEFINITIONS.filter(
  (definition) => definition.collection === 'logs',
);

export const LOG_INDEXES_MIGRATION = {
  id: '001-log-indexes',
  async up(database: Db): Promise<void> {
    const logs = database.collection('logs');
    for (const index of LOG_INDEXES) {
      await logs.createIndex(index.keys, { name: index.name });
    }
  },
  async down(database: Db): Promise<void> {
    const logs = database.collection('logs');
    for (const index of [...LOG_INDEXES].reverse()) {
      await logs.dropIndex(index.name);
    }
  },
};
