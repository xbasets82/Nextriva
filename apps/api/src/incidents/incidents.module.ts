import { Module } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getApplicationDatabaseUrl } from '../database/database-url.js';
import { IncidentsController } from './incidents.controller.js';
import { IncidentsStore } from './incidents.store.js';

@Module({
  controllers: [IncidentsController],
  providers: [
    {
      provide: IncidentsStore,
      useFactory: () =>
        new IncidentsStore(
          () =>
            new PrismaClient({
              adapter: new PrismaPg({
                connectionString: getApplicationDatabaseUrl(),
              }),
            }),
        ),
    },
  ],
})
export class IncidentsModule {}
