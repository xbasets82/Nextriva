import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { createBootstrapDatabaseClient } from './bootstrap-database.js';
import { PasswordHasher } from './password-hasher.js';
import { readBootstrapInput } from './bootstrap-input.js';
import { UsersManagementStore } from './users-management.store.js';

async function main(): Promise<void> {
  let prisma: PrismaClient | undefined;
  try {
    if (process.argv.length !== 2 || process.stdin.isTTY)
      throw new Error('stdin required');
    const input = await readBootstrapInput(process.stdin);
    const { password, ...details } = input;
    const passwordHash = await new PasswordHasher().hash(password);
    const bootstrapClient = createBootstrapDatabaseClient(
      process.env,
      (connectionString) =>
        new PrismaClient({
          adapter: new PrismaPg({ connectionString }),
        }),
    );
    prisma = bootstrapClient;
    const created = await new UsersManagementStore(bootstrapClient).bootstrap({
      ...details,
      passwordHash,
    });
    process.stdout.write(
      created
        ? 'Administrador inicial creado.\n'
        : 'Existe un administrador; no se han realizado cambios.\n',
    );
  } catch {
    process.stderr.write(
      'No se pudo aprovisionar el administrador. Revisa la entrada y el destino local.\n',
    );
    process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}
void main();
