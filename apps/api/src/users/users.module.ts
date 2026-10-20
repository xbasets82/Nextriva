import { Module, type DynamicModule } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { AuthModule, type AuthOptions } from '../auth/auth.module.js';
import { getApplicationDatabaseUrl } from '../database/database-url.js';
import { PasswordHasher } from './password-hasher.js';
import { AdministratorGuard } from './administrator.guard.js';
import { UsersController } from './users.controller.js';
import { UsersManagementService } from './users-management.service.js';
import { UsersManagementStore } from './users-management.store.js';
@Module({})
export class UsersModule {
  static register(
    authOptions: AuthOptions,
    store?: UsersManagementStore,
  ): DynamicModule {
    return {
      module: UsersModule,
      imports: [AuthModule.register(authOptions)],
      controllers: [UsersController],
      providers: [
        AdministratorGuard,
        {
          provide: UsersManagementService,
          useFactory: () => {
            return new UsersManagementService(
              store ??
                new UsersManagementStore(
                  () =>
                    new PrismaClient({
                      adapter: new PrismaPg({
                        connectionString: getApplicationDatabaseUrl(),
                      }),
                    }),
                ),
              new PasswordHasher(),
            );
          },
        },
      ],
    };
  }
}
