import { ApiErrorResponse } from '../openapi-error.js';
import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  SetMetadata,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  SESSION_ACTIVITY_REFRESH,
  SessionGuard,
  type AuthenticatedRequest,
} from '../auth/session.guard.js';
import { AdministratorGuard } from './administrator.guard.js';
import { UsersManagementService } from './users-management.service.js';
import { safeUserSchema } from './user.schema.js';
const details = {
  firstName: { type: 'string', minLength: 2, maxLength: 100 },
  lastName: { type: 'string', minLength: 2, maxLength: 150 },
  email: { type: 'string', format: 'email', maxLength: 320 },
  role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'COLLABORATOR'] },
};
const userResponse = {
  type: 'object',
  required: ['user'],
  additionalProperties: false,
  properties: { user: safeUserSchema },
};
function actor(request: AuthenticatedRequest): string {
  if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
  return request.authUser.id;
}
@ApiTags('users')
@ApiCookieAuth('session')
@ApiCookieAuth('localSession')
@ApiErrorResponse({ status: 401, description: 'Sesión inválida' })
@ApiErrorResponse({
  status: 403,
  description: 'Solo ADMIN; CSRF y origen válidos en mutaciones',
})
@ApiErrorResponse({
  status: 400,
  description: 'Datos inválidos o campos no permitidos',
})
@ApiErrorResponse({ status: 404, description: 'Usuario no encontrado' })
@ApiErrorResponse({
  status: 409,
  description:
    'Email duplicado o cambio que dejaría sin administrador, responsable o validador independiente',
})
@ApiErrorResponse({
  status: 503,
  description: 'Gestión de usuarios no disponible',
})
@Controller('api/users')
@UseGuards(SessionGuard, AdministratorGuard)
@SetMetadata(SESSION_ACTIVITY_REFRESH, false)
export class UsersController {
  constructor(
    @Inject(UsersManagementService)
    private readonly users: UsersManagementService,
  ) {}
  @Header('Cache-Control', 'no-store')
  @Get()
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['users'],
      additionalProperties: false,
      properties: { users: { type: 'array', items: safeUserSchema } },
    },
  })
  async list(@Req() request: AuthenticatedRequest) {
    return { users: await this.users.list(actor(request)) };
  }
  @Header('Cache-Control', 'no-store')
  @Get(':id')
  @ApiResponse({ status: 200, schema: userResponse })
  async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { user: await this.users.get(actor(request), id) };
  }
  @Header('Cache-Control', 'no-store')
  @Post()
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description:
      'Token de la sesión; Origin o Referer estricto también requerido',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['firstName', 'lastName', 'email', 'role', 'password'],
      properties: {
        ...details,
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
  @ApiResponse({ status: 201, schema: userResponse })
  async create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return { user: await this.users.create(actor(request), body) };
  }
  @Header('Cache-Control', 'no-store')
  @Patch(':id')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      minProperties: 1,
      additionalProperties: false,
      properties: details,
    },
  })
  @ApiResponse({ status: 200, schema: userResponse })
  async edit(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return { user: await this.users.edit(actor(request), id, body) };
  }
  @Header('Cache-Control', 'no-store')
  @Patch(':id/status')
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['isActive'],
      additionalProperties: false,
      properties: { isActive: { type: 'boolean' } },
    },
  })
  @ApiResponse({ status: 200, schema: userResponse })
  async status(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return { user: await this.users.status(actor(request), id, body) };
  }
}
