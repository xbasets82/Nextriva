import 'reflect-metadata';
import { SwaggerModule } from '@nestjs/swagger';
import { createApp } from './app.factory.js';
import { createOpenApiDocument } from './openapi.js';

async function bootstrap(): Promise<void> {
  const app = await createApp();

  if (process.env.NODE_ENV !== 'production') {
    const document = createOpenApiDocument(app);
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
