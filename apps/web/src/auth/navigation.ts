import type { Role } from '../api/users.js';

const incidentRoutes = [
  /^#\/incidents$/,
  /^#\/incidents\/[A-Za-z0-9_-]+$/,
  /^#\/incidents\/new\/[A-Za-z0-9_-]+$/,
];
const promotionRoute = /^#\/promotions(?:\/[A-Za-z0-9_-]+)?$/;

export function resolveAuthenticatedRoute(route: string, role: Role): string {
  if (route === '#/home') return route;
  if (route === '#/promotions/') return '#/promotions';
  if (route === '#/users') return role === 'ADMIN' ? route : '#/home';
  if (incidentRoutes.some((pattern) => pattern.test(route))) return route;
  if (promotionRoute.test(route)) return route;
  return '#/home';
}
