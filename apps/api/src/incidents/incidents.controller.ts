import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  incidentInputSchema,
  incidentResponseSchema,
  incidentDetailSchema,
  incidentListSchema,
} from './incident.schema.js';
import {
  Body,
  Controller,
  Get,
  Param,
  Header,
  Inject,
  Post,
  Req,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  SESSION_ACTIVITY_REFRESH,
  SessionGuard,
  type AuthenticatedRequest,
} from '../auth/session.guard.js';
import { IncidentsStore } from './incidents.store.js';
import { incidentId, newIncident } from './incident.validation.js';

@ApiTags('incidents')
@ApiCookieAuth('session')
@ApiResponse({ status: 400, description: 'Datos de incidencia inválidos' })
@ApiResponse({ status: 401, description: 'Sesión inválida' })
@ApiResponse({ status: 403, description: 'Permiso, CSRF u origen inválido' })
@ApiResponse({ status: 404, description: 'Recurso no encontrado o no visible' })
@ApiResponse({ status: 409, description: 'Promoción archivada' })
@ApiResponse({
  status: 503,
  description: 'Operación de incidencia no disponible',
})
@Controller('api/incidents')
@UseGuards(SessionGuard)
@SetMetadata(SESSION_ACTIVITY_REFRESH, false)
export class IncidentsController {
  constructor(
    @Inject(IncidentsStore) private readonly incidents: IncidentsStore,
  ) {}

  @ApiResponse({ status: 200, schema: incidentListSchema })
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: AuthenticatedRequest) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return { incidents: await this.incidents.list(request.authUser.id) };
  }

  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: incidentDetailSchema })
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return {
      incident: await this.incidents.get(request.authUser.id, incidentId(id)),
    };
  }

  @ApiBody({ schema: incidentInputSchema })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiResponse({ status: 201, schema: incidentResponseSchema })
  @Post()
  @Header('Cache-Control', 'no-store')
  async create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return {
      incident: await this.incidents.create(
        request.authUser.id,
        newIncident(body),
      ),
    };
  }
}
