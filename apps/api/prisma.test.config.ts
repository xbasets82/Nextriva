import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';
import { getTemporaryMigrationDatabaseUrl } from './src/database/database-url.js';

loadEnv({ path: resolve(process.cwd(), '../../.env.local'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: getTemporaryMigrationDatabaseUrl(),
  },
});
