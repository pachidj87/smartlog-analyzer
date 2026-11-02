import 'dotenv/config';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'mongodb',
  url:
    process.env.MONGODB_URI ??
    'mongodb://smartlog:change-me@localhost:27017/smartlog?authSource=admin',
  database: process.env.MONGO_DATABASE ?? 'smartlog',
  entities: [
    'dist/src/modules/**/entities/*.entity{.ts,.js}',
    'dist/src/db/entities/*.entity{.ts,.js}',
  ],
  migrations: [
    'dist/db/migrations/*{.ts,.js}',
    'dist/src/db/migrations/*{.ts,.js}',
  ],
  synchronize: false,
});

export default AppDataSource;
