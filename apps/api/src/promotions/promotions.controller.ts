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
  PROMOTION_PHASES,
  PROMOTION_STATUSES,
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

function actor(request: AuthenticatedRequest): string {
  if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
  return request.authUser.id;
}

@ApiTags('promotions')
@ApiCookieAuth('session')
@ApiResponse({ status: 401, description: 'Sesión inválida' })
@ApiResponse({
  status: 403,
  description: 'Solo ADMIN; CSRF y origen válidos en mutaciones',
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
@UseGuards(SessionGuard, AdministratorGuard)
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
}
