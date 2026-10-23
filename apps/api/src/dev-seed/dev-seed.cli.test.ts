import { describe, expect, it, vi } from 'vitest';
import {
  CLEANUP_CONFIRMATION,
  isCleanupConfirmation,
  runDevSeedCommand,
} from './dev-seed.cli.js';

const url = 'postgresql://seed_user:local-secret@127.0.0.1:5432/nextriva_dev';
const summary = { users: 12, promotions: 5, incidents: 60, comments: 15 };

function dependencies(confirmed: boolean) {
  return {
    loadDatabaseUrl: vi.fn(() => url),
    confirmCleanup: vi.fn(async () => confirmed),
    seed: vi.fn(async () => summary),
    clean: vi.fn(async () => summary),
  };
}

describe('development seed command confirmation', () => {
  it('accepts only the explicit cleanup phrase', () => {
    expect(isCleanupConfirmation(CLEANUP_CONFIRMATION)).toBe(true);
    expect(isCleanupConfirmation('sí')).toBe(false);
    expect(isCleanupConfirmation('')).toBe(false);
  });

  it('does not start any database operation without cleanup confirmation', async () => {
    const actions = dependencies(false);
    await expect(
      runDevSeedCommand('clean', { NODE_ENV: 'development' }, actions),
    ).rejects.toThrow('Limpieza cancelada: falta confirmación explícita.');
    expect(actions.confirmCleanup).toHaveBeenCalledOnce();
    expect(actions.seed).not.toHaveBeenCalled();
    expect(actions.clean).not.toHaveBeenCalled();
  });

  it('cleans only after confirmation and validates the destination first', async () => {
    const actions = dependencies(true);
    expect(
      await runDevSeedCommand('clean', { NODE_ENV: 'development' }, actions),
    ).toEqual(summary);
    expect(actions.clean).toHaveBeenCalledExactlyOnceWith(url);
    expect(actions.seed).not.toHaveBeenCalled();
  });

  it('rejects CI before confirmation or database access', async () => {
    const actions = dependencies(true);
    await expect(
      runDevSeedCommand('clean', { CI: 'true' }, actions),
    ).rejects.toThrow(
      'El seed solo se permite en nextriva_dev local fuera de CI.',
    );
    expect(actions.confirmCleanup).not.toHaveBeenCalled();
    expect(actions.clean).not.toHaveBeenCalled();
  });

  it('uses the default incident count and rejects an invalid count before writing', async () => {
    const actions = dependencies(false);
    expect(
      await runDevSeedCommand('seed', { NODE_ENV: 'development' }, actions),
    ).toEqual(summary);
    expect(actions.seed).toHaveBeenCalledExactlyOnceWith(url, 60);
    await expect(
      runDevSeedCommand(
        'seed',
        { NODE_ENV: 'development', NEXTRIVA_SEED_INCIDENT_COUNT: '60.5' },
        actions,
      ),
    ).rejects.toThrow();
    expect(actions.seed).toHaveBeenCalledTimes(1);
  });
});
