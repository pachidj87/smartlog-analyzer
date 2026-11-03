import 'dotenv/config';
import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';

// Resolve paths from this file's location so entity discovery does not depend
// on the process working directory (e.g. /app with dist at /app/src/api/dist).
const rootDir = join(__dirname, '..');

export const AppDataSource: DataSourceOptions = {
  type: 'mongodb',
  url:
    process.env.MONGODB_URI ??
    'mongodb://smartlog:change-me@localhost:27017/smartlog?authSource=admin',
  database: process.env.MONGODB_DATABASE ?? 'smartlog',
  entities: [
    join(rootDir, 'modules', '**', 'entities', '*.entity{.ts,.js}'),
    join(rootDir, 'db', 'entities', '*.entity{.ts,.js}'),
  ],
  synchronize: false,
};

export default AppDataSource;
