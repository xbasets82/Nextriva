import { assertRequest, isImage, isSha } from './cd-policy.mjs';

const deploymentPhases = new Set([
  'server-setup',
  'cleanup',
  'validate-request',
  'lock',
  'read-state',
  'check-state',
  'authorize',
  'inventory',
  'pull-images',
  'registry-login',
  'pull-api',
  'pull-web',
  'check-image',
  'check-schema',
  'save-state',
  'activate',
  'health',
  'audit',
  'unlock',
  'ssh',
  'docker-command',
]);
const deploymentCategories = new Set([
  'operation_failed',
  'policy_rejected',
  'state_conflict',
  'lock_unavailable',
  'registry_permission_denied',
  'network_unavailable',
  'operation_timeout',
  'tool_unavailable',
  'storage_exhausted',
  'external_command_failed',
  'database_identity_mismatch',
  'schema_incompatible',
  'image_mismatch',
  'ssh_authentication_failed',
  'ssh_host_identity_failed',
  'ssh_remote_command_failed',
  'ssh_response_invalid',
]);

export class DeploymentFailure extends Error {
  constructor(phase, category = 'operation_failed', recovery) {
    if (
      !deploymentPhases.has(phase) ||
      !deploymentCategories.has(category) ||
      (recovery !== undefined && !['succeeded', 'required'].includes(recovery))
    )
      throw new Error('Diagnóstico CD no permitido');
    const outcome = recovery ? ` recuperación=${recovery}` : '';
    super(
      `CD despliegue fallido: etapa=${phase} categoría=${category}${outcome}`,
    );
    this.phase = phase;
    this.category = category;
    this.recovery = recovery;
  }
}

export function deploymentDiagnostic(error) {
  let failure = new DeploymentFailure('server-setup');
  if (error instanceof DeploymentFailure) {
    try {
      failure = new DeploymentFailure(
        error.phase,
        error.category,
        error.recovery,
      );
    } catch {
      /* Campos alterados: mantener diagnóstico genérico. */
    }
  }
  return {
    phase: failure.phase,
    category: failure.category,
    ...(failure.recovery ? { recovery: failure.recovery } : {}),
  };
}

export function parseDeploymentFailure(value) {
  try {
    if (typeof value !== 'string' || value.length > 512) return undefined;
    const envelope = JSON.parse(value);
    if (!envelope || Object.keys(envelope).join(',') !== 'cdDiagnostic')
      return undefined;
    const record = envelope.cdDiagnostic;
    if (
      !record ||
      !Object.hasOwn(record, 'phase') ||
      !Object.hasOwn(record, 'category') ||
      Object.keys(record).some(
        (key) => !['phase', 'category', 'recovery'].includes(key),
      )
    )
      return undefined;
    return new DeploymentFailure(
      record.phase,
      record.category,
      record.recovery,
    );
  } catch {
    return undefined;
  }
}

export async function deploymentStage(
  phase,
  operation,
  category = 'operation_failed',
) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DeploymentFailure) {
      if (error.phase === 'docker-command')
        throw new DeploymentFailure(phase, error.category);
      throw error;
    }
    throw new DeploymentFailure(phase, category);
  }
}

export function assertRelease(value) {
  const image = (reference, service) =>
    isImage(reference, service) ||
    /^sha256:[a-f0-9]{64}$/.test(reference ?? '');
  if (
    !value ||
    !isSha(value.sha) ||
    !image(value.api, 'api') ||
    !image(value.web, 'web')
  )
    throw new Error('Versión estable inválida');
}

export async function deployRelease(request, io) {
  await deploymentStage(
    'validate-request',
    () => assertRequest(request),
    'policy_rejected',
  );
  const unlock = await deploymentStage(
    'lock',
    () => io.lock(),
    'lock_unavailable',
  );
  return withLockRelease(unlock, async () => {
    const state = await deploymentStage('read-state', () => io.readState());
    await deploymentStage(
      'check-state',
      () => assertRelease(state.current),
      'policy_rejected',
    );
    if (
      state.version !== 1 ||
      !Number.isSafeInteger(state.lastRunId) ||
      state.lastRunId < 0 ||
      request.runId < state.lastRunId ||
      request.expectedSha !== state.current.sha
    )
      throw new DeploymentFailure('check-state', 'state_conflict');
    await deploymentStage(
      'authorize',
      () => io.authorize(request),
      'policy_rejected',
    );
    if (state.pending && request.operation !== 'rollback')
      throw new DeploymentFailure('check-state', 'state_conflict');
    const before = await deploymentStage('inventory', () => io.inventory());
    if (
      !state.pending &&
      request.operation === 'deploy' &&
      request.sha === state.current.sha &&
      request.api === state.current.api &&
      request.web === state.current.web
    ) {
      await deploymentStage('health', () => io.health(state.current));
      return { result: 'already_deployed', sha: state.current.sha };
    }
    if (request.runId === state.lastRunId)
      throw new DeploymentFailure('check-state', 'state_conflict');
    const recovering =
      request.operation === 'rollback' && Boolean(state.pending);
    const rollbackTarget = state.pending ? state.current : state.previous;
    const target =
      request.operation === 'rollback'
        ? rollbackTarget
        : { sha: request.sha, api: request.api, web: request.web };
    await deploymentStage(
      'check-state',
      () => assertRelease(target),
      'policy_rejected',
    );
    await deploymentStage('pull-images', () => io.pull(target));
    await deploymentStage('check-schema', () => io.compatible(target));
    // Nueva comprobación justo antes de modificar aplicaciones: main puede haber avanzado.
    await deploymentStage(
      'authorize',
      () => io.authorize(request),
      'policy_rejected',
    );
    state.pending = target;
    await deploymentStage('save-state', () => io.saveState(state));
    const sameDatabase = async () => {
      if (
        JSON.stringify(
          await deploymentStage('inventory', () => io.inventory()),
        ) !== JSON.stringify(before)
      )
        throw new DeploymentFailure('inventory', 'database_identity_mismatch');
    };
    try {
      await deploymentStage('activate', () => io.activate(target));
      await deploymentStage('health', () => io.health(target));
      await sameDatabase();
    } catch (failure) {
      let recovery = 'succeeded';
      try {
        await sameDatabase();
        await deploymentStage('check-schema', () =>
          io.compatible(state.current),
        );
        await deploymentStage('activate', () => io.activate(state.current));
        await deploymentStage('health', () => io.health(state.current));
        await sameDatabase();
        state.pending = null;
        await deploymentStage('save-state', () => io.saveState(state));
        await deploymentStage('audit', () =>
          io.audit({
            result: 'rolled_back',
            sha: target.sha,
            previous: state.current.sha,
            runId: request.runId,
          }),
        );
      } catch {
        recovery = 'required';
        await deploymentStage('audit', () =>
          io.audit({
            result: 'recovery_required',
            sha: target.sha,
            previous: state.current.sha,
            runId: request.runId,
          }),
        ).catch(() => {
          // Mantener la causa primaria y recovery=required si también falla la auditoría.
        });
      }
      throw new DeploymentFailure(failure.phase, failure.category, recovery);
    }
    const old = state.current;
    state.current = target;
    if (!recovering) state.previous = old;
    state.lastRunId = request.runId;
    state.pending = null;
    await deploymentStage('save-state', () => io.saveState(state));
    const result =
      request.operation === 'rollback' ? 'rolled_back' : 'deployed';
    await deploymentStage('audit', () =>
      io.audit({
        result,
        sha: target.sha,
        previous: old.sha,
        runId: request.runId,
      }),
    );
    return { result, sha: target.sha };
  });
}

async function withLockRelease(unlock, operation) {
  let failed = false;
  try {
    return await operation();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      await deploymentStage('unlock', () => unlock());
    } catch (error) {
      if (!failed) throw error;
    }
  }
}
