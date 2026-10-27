import type { IncomingMessage, ServerResponse } from 'node:http';
import { IncidentsModule } from './incidents/incidents.module.js';
import { UsersModule } from './users/users.module.js';
import type { UsersManagementStore } from './users/users-management.store.js';
import { PromotionsModule } from './promotions/promotions.module.js';
import type { PromotionsStore } from './promotions/promotions.store.js';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { DestinationStream } from 'pino';
import { type AuthOptions } from './auth/auth.module.js';
import { AppModule } from './app.module.js';
import { createLogger } from './observability/logger.js';
import { createRequestLoggingMiddleware } from './observability/request-logging.middleware.js';
import { validateTrustedProxy } from './auth/client-address.js';

export async function createApp(
  logDestination?: DestinationStream,
  authOptions: AuthOptions = {},
  usersStore?: UsersManagementStore,
  promotionsStore?: PromotionsStore,
): Promise<INestApplication> {
  validateTrustedProxy(process.env.AUTH_TRUSTED_PROXY_IP);
  const app = await NestFactory.create({
    module: AppModule,
    imports: [
      UsersModule.register(authOptions, usersStore),
      PromotionsModule.register(promotionsStore),
      IncidentsModule,
    ],
  });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(
    (_request: IncomingMessage, response: ServerResponse, next: () => void) => {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('X-Frame-Options', 'DENY');
      response.setHeader('Referrer-Policy', 'no-referrer');
      next();
    },
  );
  app.use(createRequestLoggingMiddleware(createLogger(logDestination)));
  return app;
}
