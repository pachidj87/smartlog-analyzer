import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { AnalysesModule } from '../analyses/analyses.module';

import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule,
    HttpModule,
    TerminusModule,
    AnalysesModule,
  ],
})
export class HealthModule {}
