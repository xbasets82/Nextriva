import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import { resolveRequestId } from './request-id.js';

type RoutedRequest = IncomingMessage & {
  baseUrl?: string;
  route?: { path: unknown };
};

type RequestLoggingHandler = (
  request: RoutedRequest,
  response: ServerResponse,
  next: () => void,
) => void;

function getRoute(request: RoutedRequest): string {
  const routePath = request.route?.path;

  if (typeof routePath !== 'string') {
    return 'unmatched';
  }

  return `${request.baseUrl ?? ''}${routePath}` || 'unmatched';
}

export function createRequestLoggingMiddleware(
  logger: Logger,
): RequestLoggingHandler {
  return (request, response, next) => {
    const rawRequestId = request.headers['x-request-id'];
    const requestId = resolveRequestId(
      typeof rawRequestId === 'string' ? rawRequestId : undefined,
    );
    const startedAt = performance.now();

    response.once('finish', () => {
      logger.info({
        requestId,
        method: request.method,
        route: getRoute(request),
        statusCode: response.statusCode,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
    });

    next();
  };
}
