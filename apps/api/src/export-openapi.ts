import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { createApp } from './app.factory.js';
import { createOpenApiDocument } from './openapi.js';

const destination = process.argv[2];
if (!destination) throw new Error('An OpenAPI destination is required');
const app = await createApp();
try {
  await app.init();
  await writeFile(destination, JSON.stringify(createOpenApiDocument(app)));
} finally {
  await app.close();
}
