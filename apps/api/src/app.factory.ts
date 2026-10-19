import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { DestinationStream } from 'pino';
import { AppModule } from './app.module.js';
import { createLogger } from './observability/logger.js';
import { createRequestLoggingMiddleware } from './observability/request-logging.middleware.js';

export async function createApp(
  logDestination?: DestinationStream,
): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  app.use(createRequestLoggingMiddleware(createLogger(logDestination)));
  return app;
}
