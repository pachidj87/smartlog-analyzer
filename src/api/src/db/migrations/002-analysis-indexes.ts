import { Db } from 'mongodb';

import { INDEX_DEFINITIONS } from '../indexes';

const ANALYSIS_INDEXES = INDEX_DEFINITIONS.filter(
  (definition) => definition.collection === 'analyses',
);

export const ANALYSIS_INDEXES_MIGRATION = {
  id: '002-analysis-indexes',
  async up(database: Db): Promise<void> {
    const analyses = database.collection('analyses');
    for (const index of ANALYSIS_INDEXES) {
      await analyses.createIndex(index.keys, { name: index.name });
    }
  },
  async down(database: Db): Promise<void> {
    const analyses = database.collection('analyses');
    for (const index of [...ANALYSIS_INDEXES].reverse()) {
      await analyses.dropIndex(index.name);
    }
  },
};
