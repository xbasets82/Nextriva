import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  SESSION_ACTIVITY_REFRESH,
  SessionGuard,
  type AuthenticatedRequest,
} from '../auth/session.guard.js';
import { AdministratorGuard } from '../users/administrator.guard.js';
import {
  participantUserId,
  participantId,
  PROMOTION_PHASES,
  PROMOTION_STATUSES,
  promotionId,
} from './promotion.validation.js';
import { PromotionsService } from './promotions.service.js';

const phaseProperty = {
  type: 'string',
  enum: [...PROMOTION_PHASES],
};

const promotionProperty = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'status', 'phases', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 3, maxLength: 150 },
    description: { type: 'string', maxLength: 1000, nullable: true },
    location: { type: 'string', maxLength: 200, nullable: true },
    status: { type: 'string', enum: [...PROMOTION_STATUSES] },
    phases: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: phaseProperty,
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const promotionResponse = {
  type: 'object',
  required: ['promotion'],
  additionalProperties: false,
  properties: { promotion: promotionProperty },
};

const participantUserProperty = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'firstName', 'lastName', 'email', 'role', 'isActive'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'COLLABORATOR'] },
    isActive: { type: 'boolean' },
  },
};

const participantProperty = {
  type: 'object',
  additionalProperties: false,
  required: ['joinedAt', 'user'],
  properties: {
    joinedAt: { type: 'string', format: 'date-time' },
    user: participantUserProperty,
  },
};

function actor(request: AuthenticatedRequest): string {
  if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
  return request.authUser.id;
}

@ApiTags('promotions')
@ApiCookieAuth('session')
@ApiResponse({ status: 401, description: 'Sesión inválida' })
@ApiResponse({
  status: 403,
  description: 'Permiso insuficiente, token CSRF ausente o origen no válido',
})
@ApiResponse({
  status: 400,
  description: 'Datos inválidos o campos no permitidos',
})
@ApiResponse({ status: 404, description: 'Promoción no encontrada' })
@ApiResponse({
  status: 409,
  description: 'Conflicto con el estado de la promoción',
})
@ApiResponse({
  status: 503,
  description: 'Gestión de promociones no disponible',
})
@Controller('api/promotions')
@UseGuards(SessionGuard)
@SetMetadata(SESSION_ACTIVITY_REFRESH, false)
export class PromotionsController {
  constructor(
    @Inject(PromotionsService)
    private readonly promotions: PromotionsService,
  ) {}

  @Header('Cache-Control', 'no-store')
  @Get()
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['promotions'],
      additionalProperties: false,
      properties: { promotions: { type: 'array', items: promotionProperty } },
    },
  })
  async list(@Req() request: AuthenticatedRequest) {
    return { promotions: await this.promotions.list(actor(request)) };
  }

  @Header('Cache-Control', 'no-store')
  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: promotionResponse })
  async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { promotion: await this.promotions.get(actor(request), id) };
  }

  @Header('Cache-Control', 'no-store')
  @Get(':promotionId/participants')
  @ApiParam({ name: 'promotionId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Participantes visibles de la promoción',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['participants'],
      properties: {
        participants: { type: 'array', items: participantProperty },
      },
    },
  })
  async listParticipants(
    @Req() request: AuthenticatedRequest,
    @Param('promotionId') promotionIdValue: string,
  ) {
    return {
      participants: await this.promotions.listParticipants(
        actor(request),
        promotionId(promotionIdValue),
      ),
    };
  }

  @Header('Cache-Control', 'no-store')
  @Get(':promotionId/eligible-participants')
  @ApiParam({ name: 'promotionId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description:
      'Colaboradores activos no vinculados; ADMIN o gestor vinculado',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['candidates'],
      properties: {
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'firstName', 'lastName', 'email'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
          },
        },
      },
    },
  })
  async eligibleParticipants(
    @Req() request: AuthenticatedRequest,
    @Param('promotionId') id: string,
  ) {
    return {
      candidates: await this.promotions.eligibleParticipants(
        actor(request),
        id,
      ),
    };
  }

  @Header('Cache-Control', 'no-store')
  @Post()
  @UseGuards(AdministratorGuard)
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description:
      'Token de la sesión; Origin o Referer estricto también requerido',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'phases'],
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 3, maxLength: 150 },
        description: { type: 'string', maxLength: 1000 },
        location: { type: 'string', maxLength: 200 },
        phases: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: phaseProperty,
        },
      },
    },
  })
  @ApiResponse({ status: 201, schema: promotionResponse })
  async create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return { promotion: await this.promotions.create(actor(request), body) };
  }

  @Header('Cache-Control', 'no-store')
  @Patch(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      minProperties: 1,
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 3, maxLength: 150 },
        description: { type: 'string', maxLength: 1000 },
        location: { type: 'string', maxLength: 200 },
        phases: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: phaseProperty,
        },
      },
    },
  })
  @ApiResponse({ status: 200, schema: promotionResponse })
  async edit(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return {
      promotion: await this.promotions.edit(actor(request), id, body),
    };
  }

  @Header('Cache-Control', 'no-store')
  @Patch(':id/status')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      additionalProperties: false,
      properties: { status: { type: 'string', enum: [...PROMOTION_STATUSES] } },
    },
  })
  @ApiResponse({ status: 200, schema: promotionResponse })
  async setStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return {
      promotion: await this.promotions.setStatus(actor(request), id, body),
    };
  }

  @Header('Cache-Control', 'no-store')
  @Post(':promotionId/participants')
  @ApiParam({ name: 'promotionId', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId'],
      additionalProperties: false,
      properties: { userId: { type: 'string', format: 'uuid' } },
    },
  })
  @ApiResponse({
    status: 201,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['participant'],
      properties: { participant: participantProperty },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Conflicto de vinculación o elegibilidad',
  })
  async addParticipant(
    @Req() request: AuthenticatedRequest,
    @Param('promotionId') promotionIdValue: string,
    @Body() body: unknown,
  ) {
    return {
      participant: await this.promotions.addParticipant(
        actor(request),
        promotionId(promotionIdValue),
        participantUserId(body),
      ),
    };
  }

  @Header('Cache-Control', 'no-store')
  @Delete(':promotionId/participants/:userId')
  @HttpCode(204)
  @ApiParam({ name: 'promotionId', format: 'uuid' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiResponse({ status: 204, description: 'Vinculación retirada' })
  async removeParticipant(
    @Req() request: AuthenticatedRequest,
    @Param('promotionId') promotionIdValue: string,
    @Param('userId') userIdValue: string,
  ): Promise<void> {
    await this.promotions.removeParticipant(
      actor(request),
      promotionId(promotionIdValue),
      participantId(userIdValue),
    );
  }
}
