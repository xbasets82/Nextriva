import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../app.module.js';

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

test('GET /api/health returns HTTP 200 and the exact public body', async () => {
  const response = await fetch(`${baseUrl}/api/health`);

  expect(response.status).toBe(200);
  expect(await response.json()).toStrictEqual({ status: 'ok' });
});
