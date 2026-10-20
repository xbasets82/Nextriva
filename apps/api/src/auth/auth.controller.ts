import { safeUserSchema } from '../users/user.schema.js';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { ServerResponse } from 'node:http';
import { AuthService } from './auth.service.js';
import {
  assertTrustedOrigin,
  AUTH_CONFIGURATION,
  csrfForSession,
  clearSessionCookie,
  readSessionToken,
  sessionCookie,
  type AuthConfiguration,
} from './auth-security.js';
import {
  SESSION_ACTIVITY_REFRESH,
  SessionGuard,
  type AuthenticatedRequest,
} from './session.guard.js';

const userResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['user'],
  properties: { user: safeUserSchema },
};

function loginInput(body: unknown): { email: string; password: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw new BadRequestException('Solicitud inválida');
  const email: unknown = Reflect.get(body, 'email');
  const password: unknown = Reflect.get(body, 'password');
  if (
    Object.keys(body).some((key) => !['email', 'password'].includes(key)) ||
    typeof email !== 'string' ||
    !email.trim() ||
    email.length > 320 ||
    typeof password !== 'string' ||
    !password ||
    password.length > 1024
  )
    throw new BadRequestException('Solicitud inválida');
  return { email, password };
}

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_CONFIGURATION)
    private readonly configuration: () => AuthConfiguration,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', maxLength: 320, minLength: 1 },
        password: {
          type: 'string',
          format: 'password',
          minLength: 1,
          maxLength: 1024,
          writeOnly: true,
        },
      },
    },
  })
  @ApiOkResponse({
    schema: userResponseSchema,
    description:
      'Usuario autenticado. Sesión exclusivamente en cookie HttpOnly; HTTPS usa __Host-nextriva_session; HTTP local explícito usa nextriva_session.',
  })
  @ApiResponse({ status: 400, description: 'Solicitud inválida' })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas, sin enumerar usuarios',
  })
  @ApiResponse({ status: 403, description: 'Origen no permitido' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos' })
  @ApiResponse({ status: 503, description: 'Autenticación no disponible' })
  async login(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const configuration = this.configuration();
    assertTrustedOrigin(request.headers, configuration);
    const input = loginInput(body);
    const result = await this.auth.login(
      input.email,
      input.password,
      request.socket.remoteAddress ?? 'unknown',
      readSessionToken(request.headers.cookie, configuration),
    );
    response.setHeader(
      'Set-Cookie',
      sessionCookie(result.token, configuration),
    );
    return { user: result.user };
  }

  @Get('session')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth('session')
  @ApiOkResponse({ schema: userResponseSchema })
  @ApiResponse({ status: 401, description: 'Sesión inválida o expirada' })
  @ApiResponse({ status: 503, description: 'Autenticación no disponible' })
  session(@Req() request: AuthenticatedRequest) {
    return { user: request.authUser };
  }

  @Get('csrf')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth('session')
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['csrfToken'],
      properties: {
        csrfToken: { type: 'string', minLength: 43, maxLength: 43 },
      },
    },
    description:
      'Token ligado a la sesión. Enviar en X-CSRF-Token junto a Origin válido para mutaciones autenticadas.',
  })
  @ApiResponse({ status: 401, description: 'Sesión inválida o expirada' })
  @ApiResponse({ status: 503, description: 'Autenticación no disponible' })
  csrf(@Req() request: AuthenticatedRequest) {
    return {
      csrfToken: csrfForSession(
        readSessionToken(request.headers.cookie, this.configuration()) ?? '',
      ),
    };
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  @SetMetadata(SESSION_ACTIVITY_REFRESH, false)
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiCookieAuth('session')
  @ApiNoContentResponse({ description: 'Sesión revocada y cookie caducada' })
  @ApiResponse({ status: 401, description: 'Sesión inválida o expirada' })
  @ApiResponse({ status: 403, description: 'CSRF u origen no permitido' })
  @ApiResponse({ status: 503, description: 'Autenticación no disponible' })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<void> {
    const configuration = this.configuration();
    await this.auth.logout(
      readSessionToken(request.headers.cookie, configuration),
    );
    response.setHeader('Set-Cookie', clearSessionCookie(configuration));
  }
}
