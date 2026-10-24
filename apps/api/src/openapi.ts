import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import { httpErrorSchemas } from './openapi-error.js';

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Nextriva API')
    .setDescription('Initial API contract for Nextriva.')
    .setVersion('1.0.0')
    .addCookieAuth(
      '__Host-nextriva_session',
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'HTTPS: cookie HttpOnly, Secure, SameSite=Lax y Path=/, sin Domain.',
      },
      'session',
    )
    .addCookieAuth(
      'nextriva_session',
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'Solo HTTP local explícito: cookie HttpOnly, SameSite=Lax y Path=/; no usar en HTTPS.',
      },
      'localSession',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ...httpErrorSchemas },
  };
  return document;
}
