import { Module, type DynamicModule } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getApplicationDatabaseUrl } from '../database/database-url.js';
import { AdministratorGuard } from '../users/administrator.guard.js';
import { PromotionsController } from './promotions.controller.js';
import { PromotionsService } from './promotions.service.js';
import { PromotionsStore } from './promotions.store.js';

@Module({})
export class PromotionsModule {
  static register(store?: PromotionsStore): DynamicModule {
    return {
      module: PromotionsModule,
      controllers: [PromotionsController],
      providers: [
        AdministratorGuard,
        {
          provide: PromotionsStore,
          useFactory: () =>
            store ??
            new PromotionsStore(
              () =>
                new PrismaClient({
                  adapter: new PrismaPg({
                    connectionString: getApplicationDatabaseUrl(),
                  }),
                }),
            ),
        },
        {
          provide: PromotionsService,
          useFactory: (promotions: PromotionsStore) =>
            new PromotionsService(promotions),
          inject: [PromotionsStore],
        },
      ],
    };
  }
}
