import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { LogEntity } from '../../modules/logs/entities/log.entity';
import { AnalysisEntity } from '../../modules/analyses/entities/analysis.entity';
import { AppDataSource } from '../data-source';
import {
  formatIndexCommands,
  IndexCollection,
  INDEX_DEFINITIONS,
} from '../indexes';

const COLLECTION_ENTITIES = {
  logs: LogEntity,
  analyses: AnalysisEntity,
} as const;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const commands = formatIndexCommands(INDEX_DEFINITIONS);

  if (dryRun) {
    console.log('Indexes that would be created:');
    for (const command of commands) {
      console.log(`  ${command}`);
    }
    return;
  }

  const dataSource = new DataSource(AppDataSource);
  await dataSource.initialize();

  try {
    for (const definition of INDEX_DEFINITIONS) {
      await dataSource
        .getMongoRepository(
          COLLECTION_ENTITIES[definition.collection],
        )
        .createCollectionIndex(definition.name, definition.keys);
      console.log(`created ${definition.collection}.${definition.name}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Unable to create indexes', error);
  process.exitCode = 1;
});
