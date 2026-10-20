import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const composeFile = resolve(process.cwd(), '../../compose.yaml');
const testComposeFile = resolve(process.cwd(), '../../compose.test.yaml');

describe('local PostgreSQL configuration', () => {
  it('keeps the development service separate from test-only infrastructure', () => {
    expect(existsSync(composeFile)).toBe(true);
    expect(existsSync(testComposeFile)).toBe(true);

    const developmentCompose = readFileSync(composeFile, 'utf8');
    const testCompose = readFileSync(testComposeFile, 'utf8');
    expect(developmentCompose).toContain('postgres-dev:');
    expect(developmentCompose).toContain('nextriva_dev');
    expect(developmentCompose).toContain('127.0.0.1:5432:5432');
    expect(developmentCompose).not.toContain('postgres-test:');
    expect(developmentCompose).not.toContain('127.0.0.1:5433:5432');
    expect(testCompose).toContain('postgres-test:');
    expect(testCompose).toContain('nextriva_test');
    expect(testCompose).toContain('127.0.0.1:5433:5432');
    expect(testCompose).not.toContain('postgres-dev:');
    expect(testCompose).not.toContain('DATABASE_URL');
  });
});
