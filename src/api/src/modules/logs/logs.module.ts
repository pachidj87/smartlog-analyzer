import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LogEntity } from './entities/log.entity';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

@Module({
  imports: [TypeOrmModule.forFeature([LogEntity])],
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService, TypeOrmModule],
})
export class LogsModule {}
