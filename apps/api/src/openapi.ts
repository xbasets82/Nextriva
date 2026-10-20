import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Nextriva API')
    .setDescription('Initial API contract for Nextriva.')
    .setVersion('1.0.0')
    .addCookieAuth(
      '__Host-nextriva_session',
      { type: 'apiKey', in: 'cookie' },
      'session',
    )
    .build();
  return SwaggerModule.createDocument(app, config);
}
