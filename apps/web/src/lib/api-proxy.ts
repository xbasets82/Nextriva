export function resolveApiProxyTarget(
  target = process.env.API_PROXY_TARGET,
): string {
  return target || 'http://127.0.0.1:3000';
}
