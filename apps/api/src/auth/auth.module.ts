import {
  Global,
  Module,
  ServiceUnavailableException,
  type DynamicModule,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { getApplicationDatabaseUrl } from '../database/database-url.js';
import { PasswordHasher } from '../users/password-hasher.js';
import { AuthController } from './auth.controller.js';
import {
  AUTH_CONFIGURATION,
  validateAuthConfiguration,
  type AuthConfiguration,
} from './auth-security.js';
import {
  AuthService,
  type AuthStore,
  type NewSession,
} from './auth.service.js';
import { PrismaAuthStore } from './prisma-auth.store.js';
import { SessionGuard } from './session.guard.js';

export interface AuthOptions {
  service?: AuthService;
  configuration?: AuthConfiguration;
}

class RuntimeAuthStore implements AuthStore {
  private store?: PrismaAuthStore;

  private current(): PrismaAuthStore {
    if (!this.store) {
      const connectionString = getApplicationDatabaseUrl();
      this.store = new PrismaAuthStore(
        new PrismaClient({ adapter: new PrismaPg({ connectionString }) }),
      );
    }
    return this.store;
  }

  findUser(email: string) {
    return this.current().findUser(email);
  }
  createSession(
    session: NewSession,
    verifiedUser: Parameters<AuthStore['createSession']>[1],
    previousHash?: string,
  ) {
    return this.current().createSession(session, verifiedUser, previousHash);
  }
  consumeSession(hash: string, now: Date, refreshActivity?: boolean) {
    return this.current().consumeSession(hash, now, refreshActivity);
  }
  revokeSession(hash: string, now: Date) {
    return this.current().revokeSession(hash, now);
  }
  changePassword(...input: Parameters<AuthStore['changePassword']>) {
    return this.current().changePassword(...input);
  }
  async close() {
    await this.store?.close();
  }
}

@Module({})
@Global()
export class AuthModule {
  static register(options: AuthOptions = {}): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useFactory: () =>
            options.service ??
            new AuthService(new RuntimeAuthStore(), new PasswordHasher()),
        },
        {
          provide: AUTH_CONFIGURATION,
          useValue: () => {
            if (options.configuration) return options.configuration;
            try {
              return validateAuthConfiguration(process.env);
            } catch {
              throw new ServiceUnavailableException(
                'Autenticación no disponible',
              );
            }
          },
        },
        SessionGuard,
      ],
      exports: [SessionGuard, AuthService, AUTH_CONFIGURATION],
    };
  }
}
