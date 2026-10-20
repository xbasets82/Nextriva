import { UsersModule } from './users/users.module.js';
import type { UsersManagementStore } from './users/users-management.store.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { DestinationStream } from 'pino';
import { type AuthOptions } from './auth/auth.module.js';
import { AppModule } from './app.module.js';
import { createLogger } from './observability/logger.js';
import { createRequestLoggingMiddleware } from './observability/request-logging.middleware.js';

export async function createApp(
  logDestination?: DestinationStream,
  authOptions: AuthOptions = {},
  usersStore?: UsersManagementStore,
): Promise<INestApplication> {
  const app = await NestFactory.create({
    module: AppModule,
    imports: [UsersModule.register(authOptions, usersStore)],
  });
  app.use(createRequestLoggingMiddleware(createLogger(logDestination)));
  return app;
}
