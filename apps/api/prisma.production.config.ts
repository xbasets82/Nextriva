import { defineConfig } from 'prisma/config';
import { getProductionDatabaseUrl } from './src/database/database-url.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: getProductionDatabaseUrl() },
});
