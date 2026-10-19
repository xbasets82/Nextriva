import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { expect, test } from 'vitest';
import { AppModule } from './app.module.js';

test('the Nest application module initializes without external services', async () => {
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    await app.init();
    expect(app.getHttpAdapter().getType()).toBe('express');
  } finally {
    await app.close();
  }
});
