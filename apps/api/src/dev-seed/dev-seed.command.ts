import {
  constants,
  fstatSync,
  openSync,
  readFileSync,
  closeSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { parse } from 'dotenv';
import { PrismaClient } from '../../generated/prisma/client.js';
import {
  CLEANUP_CONFIRMATION,
  isCleanupConfirmation,
  runDevSeedCommand,
} from './dev-seed.cli.js';
import { cleanDevelopmentData, seedDevelopmentData } from './dev-seed.js';

function readDevelopmentDatabaseUrl(): string {
  if (process.env.DATABASE_URL !== undefined) return process.env.DATABASE_URL;
  let descriptor: number;
  try {
    descriptor = openSync(
      resolve(process.cwd(), '../../.env.local'),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch {
    throw new Error(
      'Configura DATABASE_URL en .env.local o en el entorno local.',
    );
  }
  try {
    const metadata = fstatSync(descriptor);
    if (
      !metadata.isFile() ||
      typeof process.getuid !== 'function' ||
      metadata.uid !== process.getuid() ||
      (metadata.mode & 0o777) !== 0o600 ||
      metadata.size > 8192
    ) {
      throw new Error('El archivo .env.local debe ser privado (modo 0600).');
    }
    const values = parse(readFileSync(descriptor, 'utf8'));
    if (typeof values.DATABASE_URL !== 'string')
      throw new Error('Configura DATABASE_URL en .env.local.');
    return values.DATABASE_URL;
  } finally {
    closeSync(descriptor);
  }
}

async function confirmCleanup(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await prompt.question(
      `Para limpiar los datos seed, escribe exactamente ${CLEANUP_CONFIRMATION}: `,
    );
    return isCleanupConfirmation(answer);
  } finally {
    prompt.close();
  }
}

async function withValidatedClient<T>(
  connectionString: string,
  action: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const database = await client.$queryRaw<Array<{ name: string }>>`
      SELECT current_database() AS name
    `;
    if (database[0]?.name !== 'nextriva_dev')
      throw new Error('La conexión no apunta a nextriva_dev.');
    return await action(client);
  } finally {
    await client.$disconnect();
  }
}

function safeErrorMessage(error: unknown): string {
  const known = new Set([
    'Configura DATABASE_URL en .env.local o en el entorno local.',
    'El archivo .env.local debe ser privado (modo 0600).',
    'Configura DATABASE_URL en .env.local.',
    'El seed solo se permite en nextriva_dev local fuera de CI.',
    'Limpieza cancelada: falta confirmación explícita.',
    'Cantidad de incidencias del seed inválida.',
    'Perfil del seed inválido.',
    'No combines perfil y cantidad de incidencias.',
    'La conexión no apunta a nextriva_dev.',
    'El destino contiene datos que coinciden con identificadores reservados del seed.',
    'No se puede limpiar: existen referencias ajenas al seed.',
    'Para reducir la cantidad de incidencias o el perfil, limpia primero el seed con confirmación explícita.',
  ]);
  return error instanceof Error && known.has(error.message)
    ? error.message
    : 'No se pudo completar el seed. Revisa la configuración local y la base de desarrollo.';
}

async function main(): Promise<void> {
  try {
    const argumentsAfterEntry = process.argv.slice(2);
    if (
      argumentsAfterEntry.length > 1 ||
      (argumentsAfterEntry.length === 1 && argumentsAfterEntry[0] !== '--clean')
    ) {
      throw new Error('Argumentos del seed inválidos.');
    }
    const operation = argumentsAfterEntry.length === 1 ? 'clean' : 'seed';
    const result = await runDevSeedCommand(operation, process.env, {
      loadDatabaseUrl: readDevelopmentDatabaseUrl,
      confirmCleanup,
      seed: (url, incidentCount, profile) =>
        withValidatedClient(url, (client) =>
          seedDevelopmentData(client, {
            incidentCount,
            ...(profile === undefined ? {} : { profile }),
          }),
        ),
      clean: (url) => withValidatedClient(url, cleanDevelopmentData),
    });
    process.stdout.write(
      `Usuarios: ${result.users}; promociones: ${result.promotions}; incidencias: ${result.incidents}; comentarios: ${result.comments}.\n`,
    );
  } catch (error) {
    process.stderr.write(`${safeErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

void main();
