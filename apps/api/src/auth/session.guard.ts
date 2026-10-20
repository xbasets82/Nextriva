import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import {
  assertCsrf,
  assertTrustedOrigin,
  AUTH_CONFIGURATION,
  readSessionToken,
  type AuthConfiguration,
} from './auth-security.js';
import type { SafeUser } from '../users/user-projection.js';

export const SESSION_ACTIVITY_REFRESH = 'auth:session-activity-refresh';

export interface AuthenticatedRequest extends IncomingMessage {
  body?: unknown;
  ip?: string;
  authUser?: SafeUser;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_CONFIGURATION)
    private readonly configuration: () => AuthConfiguration,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const configuration = this.configuration();
    const token = readSessionToken(request.headers.cookie, configuration);
    if (!token) throw new UnauthorizedException('Sesión inválida');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? '')) {
      assertTrustedOrigin(request.headers, configuration);
      const supplied = request.headers['x-csrf-token'];
      assertCsrf(token, typeof supplied === 'string' ? supplied : undefined);
    }
    const refreshActivity =
      this.reflector.get<boolean>(
        SESSION_ACTIVITY_REFRESH,
        context.getHandler(),
      ) ??
      this.reflector.get<boolean>(
        SESSION_ACTIVITY_REFRESH,
        context.getClass(),
      ) ??
      true;
    request.authUser = await this.auth.authenticate(token, { refreshActivity });
    return true;
  }
}
