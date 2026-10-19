import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const composeFile = resolve(process.cwd(), '../../compose.yaml');

describe('local PostgreSQL configuration', () => {
  it('defines isolated development and test services', () => {
    expect(existsSync(composeFile)).toBe(true);

    const compose = readFileSync(composeFile, 'utf8');
    expect(compose).toContain('postgres-dev:');
    expect(compose).toContain('postgres-test:');
    expect(compose).toContain('nextriva_dev');
    expect(compose).toContain('nextriva_test');
    expect(compose).toContain('127.0.0.1:5432:5432');
    expect(compose).toContain('127.0.0.1:5433:5432');
  });
});
