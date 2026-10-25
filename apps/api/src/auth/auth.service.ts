import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  normalizeEmail,
  toSafeUser,
  type UserRecord,
} from '../users/user-projection.js';
import type { PasswordHasher } from '../users/password-hasher.js';
import {
  LoginLimiter,
  SESSION_MAX_AGE_MS,
  SESSION_TOKEN_PATTERN,
} from './auth-security.js';

export interface NewSession {
  userId: string;
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface AuthStore {
  findUser(email: string): Promise<UserRecord | null>;
  createSession(
    session: NewSession,
    verifiedUser: VerifiedUser,
    previousHash?: string,
  ): Promise<UserRecord | null>;
  consumeSession(
    hash: string,
    now: Date,
    refreshActivity?: boolean,
  ): Promise<UserRecord | null>;
  revokeSession(hash: string, now: Date): Promise<boolean>;
  changePassword(
    verified: VerifiedUser,
    passwordHash: string,
    sessionHash: string,
    now: Date,
  ): Promise<boolean>;
  close?(): Promise<void>;
}

export type VerifiedUser = Pick<
  UserRecord,
  'id' | 'email' | 'passwordHash' | 'role'
>;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  private readonly limiter = new LoginLimiter();
  private readonly passwordLimiter = new LoginLimiter();
  private readonly dummyHash: Promise<string | undefined>;

  constructor(
    private readonly store: AuthStore,
    private readonly hasher: Pick<PasswordHasher, 'hash' | 'verify'>,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.dummyHash = hasher
      .hash(randomBytes(32).toString('base64url'))
      .catch(() => undefined);
  }

  async login(
    email: string,
    password: string,
    ip: string,
    previousToken?: string,
  ) {
    const normalizedEmail = normalizeEmail(email);
    return this.limiter.serialize(normalizedEmail, ip, () =>
      this.attemptLogin(normalizedEmail, password, ip, previousToken),
    );
  }

  private async attemptLogin(
    normalizedEmail: string,
    password: string,
    ip: string,
    previousToken?: string,
  ) {
    this.limiter.assertAllowed(normalizedEmail, ip, this.clock().getTime());
    try {
      const dummyHash = await this.dummyHash;
      if (!dummyHash)
        throw new ServiceUnavailableException('Autenticación no disponible');
      const user = await this.store.findUser(normalizedEmail);
      const matches = await this.hasher
        .verify(user?.passwordHash ?? dummyHash, password)
        .catch(() => false);
      if (!user || !user.isActive || !matches) {
        this.limiter.recordFailure(normalizedEmail, ip, this.clock().getTime());
        throw new UnauthorizedException('Credenciales inválidas');
      }
      const token = randomBytes(32).toString('base64url');
      const now = this.clock();
      const authenticatedUser = await this.store.createSession(
        {
          userId: user.id,
          tokenHash: hashSessionToken(token),
          createdAt: now,
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_MS),
        },
        user,
        previousToken && SESSION_TOKEN_PATTERN.test(previousToken)
          ? hashSessionToken(previousToken)
          : undefined,
      );
      if (!authenticatedUser)
        throw new UnauthorizedException('Credenciales inválidas');
      return { user: toSafeUser(authenticatedUser), token };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Autenticación no disponible');
    }
  }

  async authenticate(
    token: string | undefined,
    options: { refreshActivity?: boolean } = {},
  ) {
    if (!token || !SESSION_TOKEN_PATTERN.test(token))
      throw new UnauthorizedException('Sesión inválida');
    try {
      const user = await this.store.consumeSession(
        hashSessionToken(token),
        this.clock(),
        options.refreshActivity ?? true,
      );
      if (!user || !user.isActive)
        throw new UnauthorizedException('Sesión inválida');
      return toSafeUser(user);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Autenticación no disponible');
    }
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token || !SESSION_TOKEN_PATTERN.test(token))
      throw new UnauthorizedException('Sesión inválida');
    try {
      const revoked = await this.store.revokeSession(
        hashSessionToken(token),
        this.clock(),
      );
      if (!revoked) throw new UnauthorizedException('Sesión inválida');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Autenticación no disponible');
    }
  }

  async changePassword(
    identity: Pick<VerifiedUser, 'id' | 'email'>,
    token: string | undefined,
    input: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    },
    ip: string,
  ): Promise<void> {
    if (!token || !SESSION_TOKEN_PATTERN.test(token))
      throw new UnauthorizedException('Sesión inválida');
    const normalized = normalizeEmail(identity.email);
    return this.passwordLimiter.serialize(normalized, ip, async () => {
      this.passwordLimiter.assertAllowed(
        normalized,
        ip,
        this.clock().getTime(),
      );
      try {
        const user = await this.store.findUser(normalized);
        if (!user || !user.isActive || user.id !== identity.id)
          throw new UnauthorizedException('Sesión inválida');
        const valid = await this.hasher
          .verify(user.passwordHash, input.currentPassword)
          .catch(() => false);
        if (!valid) {
          this.passwordLimiter.recordFailure(
            normalized,
            ip,
            this.clock().getTime(),
          );
          throw new BadRequestException(
            'No se pudo cambiar la contraseña. Revisa los datos.',
          );
        }
        const passwordHash = await this.hasher.hash(input.newPassword);
        const changed = await this.store.changePassword(
          user,
          passwordHash,
          hashSessionToken(token),
          this.clock(),
        );
        if (!changed)
          throw new BadRequestException(
            'No se pudo cambiar la contraseña. Revisa los datos.',
          );
      } catch (error) {
        if (error instanceof HttpException) throw error;
        throw new ServiceUnavailableException('Autenticación no disponible');
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.store.close?.();
  }
}
