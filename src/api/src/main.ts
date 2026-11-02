import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SmartLog Analyzer API')
    .setDescription('Log ingestion, analysis jobs, and health endpoints')
    .setVersion('1.0')
    .addTag('Logs')
    .addTag('Analyses')
    .addTag('Health')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument, {
    useGlobalPrefix: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
