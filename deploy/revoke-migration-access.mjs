import pg from 'pg';
import { getApplicationDatabaseUrl } from './dist/src/database/database-url.js';

// El runtime no debe leer ni modificar los metadatos privados del migrador.
async function revokeMigrationAccess() {
  const client = new pg.Client({
    connectionString: getApplicationDatabaseUrl(),
  });
  try {
    await client.connect();
    await client.query(
      'REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM nextriva_app',
    );
  } finally {
    await client.end();
  }
}

revokeMigrationAccess().catch(() => {
  console.error('No se pudo restringir el acceso a los metadatos de migración');
  process.exitCode = 1;
});
