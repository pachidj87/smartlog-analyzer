import 'dotenv/config';

import { MongoClient } from 'mongodb';
import type { Document } from 'mongodb';

import { ANALYSIS_INDEXES_MIGRATION } from './002-analysis-indexes';
import { LOG_INDEXES_MIGRATION } from './001-log-indexes';

const MIGRATIONS = [LOG_INDEXES_MIGRATION, ANALYSIS_INDEXES_MIGRATION];
const MIGRATIONS_COLLECTION = '_smartlog_migrations';

interface AppliedMigration extends Document {
  _id: string;
  appliedAt: Date;
}

function rollbackTarget(): string | undefined {
  const flagIndex = process.argv.indexOf('--rollback');
  if (flagIndex === -1) {
    return undefined;
  }

  const target = process.argv[flagIndex + 1];
  if (!target || target.startsWith('--')) {
    throw new Error('Indica el identificador de migración que se revertirá');
  }
  return target;
}

async function main(): Promise<void> {
  const target = rollbackTarget();
  const dryRun = process.argv.includes('--dry-run');
  const rollbackMigration = target
    ? MIGRATIONS.find(({ id }) => id === target)
    : undefined;

  if (target && !rollbackMigration) {
    throw new Error(`Migración desconocida: ${target}`);
  }

  if (dryRun) {
    if (target) {
      console.log(`Se revertiría: ${target}`);
      return;
    }

    console.log('Migraciones configuradas (sin consultar la base de datos):');
    for (const migration of MIGRATIONS) {
      console.log(`  ${migration.id}`);
    }
    return;
  }

  const uri =
    process.env.MONGODB_URI ??
    'mongodb://localhost:27017/smartlog?authSource=admin';
  const databaseName = process.env.MONGODB_DATABASE ?? 'smartlog';
  const client = new MongoClient(uri);

  await client.connect();
  try {
    const database = client.db(databaseName);
    const migrationsCollection = database.collection<AppliedMigration>(
      MIGRATIONS_COLLECTION,
    );
    const applied = await migrationsCollection
      .find({}, { projection: { _id: 1 } })
      .toArray();
    const appliedIds = new Set(applied.map(({ _id }) => String(_id)));

    if (target) {
      const migration = rollbackMigration;
      if (!migration) {
        throw new Error(`Migración desconocida: ${target}`);
      }
      if (!appliedIds.has(target)) {
        throw new Error(`La migración ${target} no está aplicada`);
      }

      const latestApplied = [...MIGRATIONS]
        .reverse()
        .find(({ id }) => appliedIds.has(id));
      if (latestApplied?.id !== target) {
        throw new Error(
          `Revierte primero la migración más reciente: ${latestApplied?.id}`,
        );
      }

      await migration.down(database);
      await migrationsCollection.deleteOne({ _id: target });
      console.log(`revertida ${target}`);
      return;
    }

    for (const migration of MIGRATIONS) {
      if (appliedIds.has(migration.id)) {
        console.log(`omitida ${migration.id} (ya aplicada)`);
        continue;
      }

      await migration.up(database);
      await migrationsCollection.insertOne({
        _id: migration.id,
        appliedAt: new Date(),
      });
      console.log(`aplicada ${migration.id}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    'No se pudieron aplicar/revertir las migraciones de MongoDB',
    error,
  );
  process.exitCode = 1;
});
