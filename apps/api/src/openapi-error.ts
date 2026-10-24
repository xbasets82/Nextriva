import { ApiResponse, getSchemaPath, type SchemaObject } from '@nestjs/swagger';

type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 503;

// Formas reales de Nest y del conflicto versionado, sin propiedades internas.
function standardError(status: ErrorStatus): SchemaObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['message', 'error', 'statusCode'],
    properties: {
      message: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
        ],
      },
      error: { type: 'string' },
      statusCode: { type: 'integer', enum: [status] },
    },
  };
}

export const httpErrorSchemas: Record<string, SchemaObject> = {
  ...Object.fromEntries(
    ([400, 401, 403, 404, 409, 503] as const).map((status) => [
      `HttpError${status}`,
      standardError(status),
    ]),
  ),
  HttpError429: {
    type: 'object',
    additionalProperties: false,
    required: ['message', 'statusCode'],
    properties: {
      message: { type: 'string' },
      statusCode: { type: 'integer', enum: [429] },
    },
  },
  IncidentVersionConflict: {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'message'],
    properties: {
      code: { type: 'string', enum: ['INCIDENT_VERSION_CONFLICT'] },
      message: { type: 'string' },
    },
  },
};

export function ApiErrorResponse(options: {
  status: ErrorStatus;
  description: string;
  versionConflict?: boolean;
}) {
  const ordinary = { $ref: getSchemaPath(`HttpError${options.status}`) };
  return ApiResponse({
    status: options.status,
    description: options.description,
    schema: options.versionConflict
      ? {
          oneOf: [ordinary, { $ref: getSchemaPath('IncidentVersionConflict') }],
        }
      : ordinary,
  });
}
