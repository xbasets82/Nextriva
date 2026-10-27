import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

function normalize(address: string): string {
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

export function validateTrustedProxy(address: string | undefined): void {
  if (address !== undefined && !isIP(address)) {
    throw new Error('AUTH_TRUSTED_PROXY_IP debe ser una única IP explícita.');
  }
}

// Solo se admite un salto conocido; el proxy debe sobrescribir X-Forwarded-For.
export function clientAddress(
  request: Pick<IncomingMessage, 'socket' | 'headers'>,
  trustedProxy = process.env.AUTH_TRUSTED_PROXY_IP,
): string {
  validateTrustedProxy(trustedProxy);
  const remote = normalize(request.socket.remoteAddress ?? 'unknown');
  const forwarded = request.headers['x-forwarded-for'];
  if (
    trustedProxy !== undefined &&
    remote === normalize(trustedProxy) &&
    typeof forwarded === 'string' &&
    isIP(forwarded)
  ) {
    return normalize(forwarded);
  }
  return remote;
}
