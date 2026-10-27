import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { validateDemoSeedEnvironment } from './demo-seed.config.js';
import { readDemoCredentials, seedDemoData } from './demo-seed.js';

async function main(): Promise<void> {
  const connectionString = validateDemoSeedEnvironment(process.env);
  const credentials = readDemoCredentials(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const result = await seedDemoData(prisma, credentials);
    console.log(
      JSON.stringify({
        users: result.users,
        promotions: result.promotions,
        incidents: result.incidents,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error(
    'No se pudo inicializar DEMO. Comprueba destino, confirmación, marcador, base vacía y credenciales externas.',
  );
  process.exitCode = 1;
});
