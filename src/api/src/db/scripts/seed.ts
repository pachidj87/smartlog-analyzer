import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { AnalysisEntity } from '../../modules/analyses/entities/analysis.entity';
import { LogEntity } from '../../modules/logs/entities/log.entity';
import { AppDataSource } from '../data-source';
import { buildDemoAnalyses, buildDemoLogs } from '../seeds/demo-data';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const reset = process.argv.includes('--reset');
  const now = new Date();
  const logs = buildDemoLogs(now);
  const analyses = buildDemoAnalyses([], now);

  if (dryRun) {
    console.log(
      `Would insert ${logs.length} logs across ${
        new Set(logs.map((log) => log.service)).size
      } services`,
    );
    console.log(`Would insert ${analyses.length} analyses`);
    if (reset) {
      console.log('Would clear the logs and analyses collections first');
    }
    return;
  }

  const dataSource = new DataSource(AppDataSource);
  await dataSource.initialize();

  try {
    const logsRepository = dataSource.getMongoRepository(LogEntity);
    const analysesRepository = dataSource.getMongoRepository(AnalysisEntity);

    if (reset) {
      await logsRepository.clear();
      await analysesRepository.clear();
    }

    const ingestedAt = new Date();
    const savedLogs = await logsRepository.save(
      logs.map((log) =>
        logsRepository.create({
          ...log,
          timestamp: new Date(log.timestamp),
          ingestedAt,
        }),
      ),
    );

    const logIds = savedLogs.map((log) => log._id.toHexString());
    const seededAnalyses = buildDemoAnalyses(logIds.slice(0, 2), now);
    await analysesRepository.save(
      seededAnalyses.map((analysis) => analysesRepository.create(analysis)),
    );

    console.log(
      `Inserted ${savedLogs.length} logs and ${seededAnalyses.length} analyses`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Unable to seed demo data', error);
  process.exitCode = 1;
});
