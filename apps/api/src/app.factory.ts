import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { DestinationStream } from 'pino';
import { AuthModule, type AuthOptions } from './auth/auth.module.js';
import { AppModule } from './app.module.js';
import { createLogger } from './observability/logger.js';
import { createRequestLoggingMiddleware } from './observability/request-logging.middleware.js';

export async function createApp(
  logDestination?: DestinationStream,
  authOptions: AuthOptions = {},
): Promise<INestApplication> {
  const app = await NestFactory.create({
    module: AppModule,
    imports: [AuthModule.register(authOptions)],
  });
  app.use(createRequestLoggingMiddleware(createLogger(logDestination)));
  return app;
}
