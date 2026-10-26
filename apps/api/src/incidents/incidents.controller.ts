import { incidentDeletionInput } from './incident.soft-delete.js';
import { incidentFilterOptionsSchema } from './incident.schema.js';
import { ApiErrorResponse } from '../openapi-error.js';
import { incidentAssignment } from './incident.assignment.js';
import { incidentStartInput } from './incident.state.js';
import {
  ApiBody,
  ApiOperation,
  ApiCookieAuth,
  ApiHeader,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  personalSummarySchema,
  deletedIncidentListSchema,
  deletedIncidentResponseSchema,
  assignmentInputSchema,
  startInputSchema,
  eligibleAssigneesSchema,
  commentInputSchema,
  commentResponseSchema,
  incidentInputSchema,
  incidentResponseSchema,
  incidentDetailSchema,
  incidentListSchema,
  solutionDraftInputSchema,
  solutionSubmissionInputSchema,
  solutionRejectionInputSchema,
} from './incident.schema.js';
import {
  Body,
  Controller,
  Get,
  Param,
  Header,
  HttpCode,
  Inject,
  Post,
  Patch,
  Put,
  Query,
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
import {
  incidentId,
  incidentListQuery,
  newIncidentComment,
  newIncident,
  newIncidentSolutionDraft,
  newIncidentSolutionSubmission,
  newIncidentSolutionRejection,
  INCIDENT_CATEGORIES,
  INCIDENT_PRIORITIES,
  INCIDENT_SORT_DIRECTIONS,
  INCIDENT_SORT_FIELDS,
  INCIDENT_STATUSES,
} from './incident.validation.js';

@ApiTags('incidents')
@ApiCookieAuth('session')
@ApiCookieAuth('localSession')
@ApiErrorResponse({ status: 400, description: 'Datos de incidencia inválidos' })
@ApiErrorResponse({ status: 401, description: 'Sesión inválida' })
@ApiErrorResponse({
  status: 403,
  description: 'Permiso, CSRF u origen inválido',
})
@ApiErrorResponse({
  status: 404,
  description: 'Recurso no encontrado o no visible',
})
@ApiErrorResponse({ status: 409, description: 'Promoción archivada' })
@ApiErrorResponse({
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

  @ApiOperation({
    description:
      'Orden predeterminado: prioridad HIGH, MEDIUM, LOW (Alta→Media→Baja), createdAt DESC e ID DESC. sortBy=priority: asc LOW→MEDIUM→HIGH (Baja→Media→Alta), desc al revés. sortBy=status: asc OPEN→IN_PROGRESS→PENDING_VALIDATION→CLOSED, desc al revés. sortBy=createdAt: asc más antigua→más reciente, desc más reciente→más antigua. Los empates se resuelven por createdAt DESC e ID DESC (solo ID DESC al ordenar por fecha). El ámbito y los filtros se aplican antes de contar y paginar.',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    schema: { type: 'string', maxLength: 150 },
  })
  @ApiQuery({
    name: 'promotionId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: [...INCIDENT_STATUSES] },
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    schema: { type: 'string', enum: [...INCIDENT_PRIORITIES] },
  })
  @ApiQuery({
    name: 'category',
    required: false,
    schema: { type: 'string', enum: [...INCIDENT_CATEGORIES] },
  })
  @ApiQuery({
    name: 'assignedToId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description:
      'Campo de ordenación permitido; si se indica sin sortDirection, usa desc.',
    schema: { type: 'string', enum: [...INCIDENT_SORT_FIELDS] },
  })
  @ApiQuery({
    name: 'sortDirection',
    required: false,
    description: 'Dirección asc o desc; requiere sortBy.',
    schema: { type: 'string', enum: [...INCIDENT_SORT_DIRECTIONS] },
  })
  @ApiResponse({ status: 200, schema: incidentListSchema })
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return this.incidents.list(request.authUser.id, incidentListQuery(query));
  }

  @ApiOperation({
    description:
      'Responsables distintos derivados exclusivamente de incidencias visibles, incluidos usuarios inactivos que conservan una asignación. No es un directorio general.',
  })
  @ApiResponse({ status: 200, schema: incidentFilterOptionsSchema })
  @Get('filter-options')
  @Header('Cache-Control', 'no-store')
  async filterOptions(@Req() request: AuthenticatedRequest) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return {
      assignees: await this.incidents.filterOptions(request.authUser.id),
    };
  }

  @ApiOperation({
    description:
      'Resumen del usuario de sesión: countsByStatus de sus asignadas y visibleCountsByStatus de todas las visibles conforme a su rol y promoción. Cuatro estados explícitos en ambos recuentos; top 10 siempre de asignadas no cerradas por prioridad HIGH/MEDIUM/LOW, estado IN_PROGRESS/OPEN/PENDING_VALIDATION, createdAt ASC e id ASC. Sin filtros de identidad del cliente.',
  })
  @ApiResponse({ status: 200, schema: personalSummarySchema })
  @Get('personal-summary')
  @Header('Cache-Control', 'no-store')
  async personalSummary(@Req() request: AuthenticatedRequest) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return this.incidents.personalSummary(request.authUser.id);
  }

  @ApiOperation({
    description:
      'Consulta restringida de incidencias eliminadas. ADMIN global; MANAGER con vinculación vigente. Mismos filtros y paginación que el listado operativo; orden determinista. Sin restauración.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({
    name: 'promotionId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'q',
    required: false,
    schema: { type: 'string', maxLength: 150 },
  })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: { type: 'string', enum: [...INCIDENT_STATUSES] },
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    schema: { type: 'string', enum: [...INCIDENT_PRIORITIES] },
  })
  @ApiQuery({
    name: 'category',
    required: false,
    schema: { type: 'string', enum: [...INCIDENT_CATEGORIES] },
  })
  @ApiQuery({
    name: 'assignedToId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    schema: { type: 'string', enum: [...INCIDENT_SORT_FIELDS] },
  })
  @ApiQuery({
    name: 'sortDirection',
    required: false,
    schema: { type: 'string', enum: [...INCIDENT_SORT_DIRECTIONS] },
  })
  @ApiResponse({ status: 200, schema: deletedIncidentListSchema })
  @Get('deleted')
  @Header('Cache-Control', 'no-store')
  async deleted(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return this.incidents.listDeleted(
      request.authUser.id,
      incidentListQuery(query),
    );
  }

  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({ schema: solutionRejectionInputSchema })
  @ApiResponse({ status: 200, schema: deletedIncidentResponseSchema })
  @ApiErrorResponse({
    status: 409,
    description:
      'Eliminación repetida, estado incompatible, promoción archivada o INCIDENT_VERSION_CONFLICT',
    versionConflict: true,
  })
  @Post(':id/soft-delete')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async softDelete(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return {
      incident: await this.incidents.softDelete(
        request.authUser.id,
        incidentId(id),
        incidentDeletionInput(body),
      ),
    };
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

  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({ schema: commentInputSchema })
  @ApiResponse({ status: 201, schema: commentResponseSchema })
  @ApiErrorResponse({
    status: 409,
    description: 'Incidencia cerrada o promoción archivada',
  })
  @Post(':id/comments')
  @Header('Cache-Control', 'no-store')
  async comment(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return {
      comment: await this.incidents.comment(
        request.authUser.id,
        incidentId(id),
        newIncidentComment(body).body,
      ),
    };
  }

  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: eligibleAssigneesSchema })
  @ApiErrorResponse({
    status: 409,
    description: 'Estado incompatible o promoción archivada',
  })
  @Get(':id/eligible-assignees')
  @Header('Cache-Control', 'no-store')
  async eligibleAssignees(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return {
      users: await this.incidents.eligibleAssignees(
        request.authUser.id,
        incidentId(id),
      ),
    };
  }

  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({ schema: assignmentInputSchema })
  @ApiResponse({ status: 200, schema: incidentResponseSchema })
  @ApiErrorResponse({
    status: 409,
    description: 'Estado incompatible o INCIDENT_VERSION_CONFLICT',
    versionConflict: true,
  })
  @Patch(':id/assignment')
  @Header('Cache-Control', 'no-store')
  async assign(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return {
      incident: await this.incidents.assign(
        request.authUser.id,
        incidentId(id),
        incidentAssignment(body),
      ),
    };
  }

  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({ schema: startInputSchema })
  @ApiResponse({ status: 200, schema: incidentResponseSchema })
  @ApiErrorResponse({
    status: 409,
    description:
      'Estado incompatible, sin responsable o INCIDENT_VERSION_CONFLICT',
    versionConflict: true,
  })
  @Post(':id/start')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async start(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return {
      incident: await this.incidents.start(
        request.authUser.id,
        incidentId(id),
        incidentStartInput(body),
      ),
    };
  }

  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({ schema: solutionDraftInputSchema })
  @ApiResponse({ status: 200, schema: incidentResponseSchema })
  @ApiErrorResponse({
    status: 409,
    description:
      'Estado incompatible, promoción archivada o INCIDENT_VERSION_CONFLICT',
    versionConflict: true,
  })
  @Put(':id/solution')
  @Header('Cache-Control', 'no-store')
  async saveSolution(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return {
      incident: await this.incidents.saveSolution(
        request.authUser.id,
        incidentId(id),
        newIncidentSolutionDraft(body),
      ),
    };
  }

  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({ schema: solutionSubmissionInputSchema })
  @ApiResponse({ status: 200, schema: incidentResponseSchema })
  @ApiErrorResponse({
    status: 409,
    description:
      'Estado incompatible, solución/validador pendiente o INCIDENT_VERSION_CONFLICT',
    versionConflict: true,
  })
  @Post(':id/submit-solution')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async submitSolution(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return {
      incident: await this.incidents.submitSolution(
        request.authUser.id,
        incidentId(id),
        newIncidentSolutionSubmission(body),
      ),
    };
  }

  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({ schema: solutionSubmissionInputSchema })
  @ApiResponse({ status: 200, schema: incidentResponseSchema })
  @ApiErrorResponse({
    status: 409,
    description:
      'Estado incompatible, promoción archivada o INCIDENT_VERSION_CONFLICT',
    versionConflict: true,
  })
  @Post(':id/approve-solution')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async approveSolution(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return {
      incident: await this.incidents.approveSolution(
        request.authUser.id,
        incidentId(id),
        newIncidentSolutionSubmission(body),
      ),
    };
  }

  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({ schema: solutionRejectionInputSchema })
  @ApiResponse({ status: 200, schema: incidentResponseSchema })
  @ApiErrorResponse({
    status: 409,
    description:
      'Estado incompatible, promoción archivada o INCIDENT_VERSION_CONFLICT',
    versionConflict: true,
  })
  @Post(':id/reject-solution')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async rejectSolution(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!request.authUser) throw new UnauthorizedException('Sesión inválida');
    return {
      incident: await this.incidents.rejectSolution(
        request.authUser.id,
        incidentId(id),
        newIncidentSolutionRejection(body),
      ),
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
