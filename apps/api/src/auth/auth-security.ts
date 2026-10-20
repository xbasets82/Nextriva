import type { IncomingHttpHeaders } from 'node:http';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { normalizeEmail } from '../users/user-projection.js';

export interface AuthConfiguration {
  origin: string;
  localHttp: boolean;
}

export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;

export function validateAuthConfiguration(
  environment: NodeJS.ProcessEnv,
): AuthConfiguration {
  try {
    const origin = environment.AUTH_ORIGIN ?? '';
    const url = new URL(origin);
    const localHttp = environment.AUTH_LOCAL_HTTP === 'true';
    const localDevelopment =
      environment.NODE_ENV === 'development' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname);
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      (localHttp
        ? !localDevelopment || url.protocol !== 'http:'
        : url.protocol !== 'https:')
    ) {
      throw new Error();
    }
    return { origin, localHttp };
  } catch {
    throw new Error('Configuración de autenticación inválida');
  }
}

export function assertTrustedOrigin(
  headers: Pick<IncomingHttpHeaders, 'origin' | 'referer'>,
  config: AuthConfiguration,
): void {
  if (headers.origin !== undefined) {
    if (headers.origin === config.origin) return;
  } else if (headers.referer) {
    try {
      const url = new URL(headers.referer);
      if (url.origin === config.origin && !url.username && !url.password)
        return;
    } catch {
      // Un Referer malformado no demuestra un origen de confianza.
    }
  }
  throw new ForbiddenException('Origen no permitido');
}

function cookieName(config: AuthConfiguration): string {
  return config.localHttp ? 'nextriva_session' : '__Host-nextriva_session';
}

export function sessionCookie(
  token: string,
  config: AuthConfiguration,
): string {
  const secure = config.localHttp ? '' : '; Secure';
  return `${cookieName(config)}=${token}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=28800`;
}

export function readSessionToken(
  cookie: string | undefined,
  config: AuthConfiguration,
): string | undefined {
  const matches = (cookie ?? '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${cookieName(config)}=`));
  const token =
    matches.length === 1
      ? matches[0]?.slice(cookieName(config).length + 1)
      : undefined;
  return token && SESSION_TOKEN_PATTERN.test(token) ? token : undefined;
}

export function csrfForSession(token: string): string {
  return createHmac('sha256', token)
    .update('nextriva:csrf:v1')
    .digest('base64url');
}

export function assertCsrf(token: string, supplied: string | undefined): void {
  if (
    !supplied ||
    !SESSION_TOKEN_PATTERN.test(supplied) ||
    !timingSafeEqual(Buffer.from(csrfForSession(token)), Buffer.from(supplied))
  ) {
    throw new ForbiddenException('Token CSRF inválido');
  }
}

export class LoginLimiter {
  private readonly failures = new Map<string, number[]>();
  private readonly queues = new Map<string, Promise<void>>();

  async serialize<T>(
    email: string,
    ip: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = this.key(email, ip);
    const previous = this.queues.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queues.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
      if (this.queues.get(key) === current) this.queues.delete(key);
    }
  }

  private key(email: string, ip: string): string {
    return createHash('sha256')
      .update(JSON.stringify([normalizeEmail(email), ip]))
      .digest('hex');
  }

  private recent(email: string, ip: string, now: number): number[] {
    for (const [key, failures] of this.failures) {
      const recent = failures.filter((time) => time > now - 900_000);
      if (recent.length) this.failures.set(key, recent);
      else this.failures.delete(key);
    }
    return this.failures.get(this.key(email, ip)) ?? [];
  }

  assertAllowed(email: string, ip: string, now: number): void {
    if (this.recent(email, ip, now).length >= 5) {
      throw new HttpException(
        'Demasiados intentos. Inténtalo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(email: string, ip: string, now: number): void {
    this.failures.set(this.key(email, ip), [
      ...this.recent(email, ip, now),
      now,
    ]);
  }
}

export const AUTH_CONFIGURATION = Symbol('AUTH_CONFIGURATION');
