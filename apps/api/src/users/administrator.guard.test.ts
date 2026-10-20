import type { ExecutionContext } from '@nestjs/common';
import { expect, it } from 'vitest';
import { AdministratorGuard } from './administrator.guard.js';
function context(role?: string, isActive = true): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ authUser: role ? { role, isActive } : undefined }),
    }),
  } as unknown as ExecutionContext;
}
it('allows only an active ADMIN and denies unknown/missing/inactive actors', () => {
  const guard = new AdministratorGuard();
  expect(guard.canActivate(context('ADMIN'))).toBe(true);
  for (const role of ['MANAGER', 'COLLABORATOR', 'OWNER', undefined])
    expect(() => guard.canActivate(context(role))).toThrow(
      'Operación no permitida',
    );
  expect(() => guard.canActivate(context('ADMIN', false))).toThrow(
    'Operación no permitida',
  );
});
