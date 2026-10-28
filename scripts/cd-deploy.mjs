import { assertRequest, isImage, isSha } from './cd-policy.mjs';

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
  assertRequest(request);
  const unlock = await io.lock();
  try {
    const state = await io.readState();
    assertRelease(state.current);
    if (
      state.version !== 1 ||
      !Number.isSafeInteger(state.lastRunId) ||
      state.lastRunId < 0 ||
      request.runId < state.lastRunId ||
      request.expectedSha !== state.current.sha
    )
      throw new Error('Versión esperada o ejecución obsoleta');
    await io.authorize(request);
    if (state.pending && request.operation !== 'rollback')
      throw new Error('Recuperación supervisada pendiente');
    const before = await io.inventory();
    if (
      !state.pending &&
      request.operation === 'deploy' &&
      request.sha === state.current.sha &&
      request.api === state.current.api &&
      request.web === state.current.web
    ) {
      await io.health(state.current);
      return { result: 'already_deployed', sha: state.current.sha };
    }
    if (request.runId === state.lastRunId)
      throw new Error('Ejecución ya utilizada');
    const recovering =
      request.operation === 'rollback' && Boolean(state.pending);
    const rollbackTarget = state.pending ? state.current : state.previous;
    const target =
      request.operation === 'rollback'
        ? rollbackTarget
        : { sha: request.sha, api: request.api, web: request.web };
    assertRelease(target);
    await io.pull(target);
    await io.compatible(target);
    // Nueva comprobación justo antes de modificar aplicaciones: main puede haber avanzado.
    await io.authorize(request);
    state.pending = target;
    await io.saveState(state);
    const sameDatabase = async () => {
      if (JSON.stringify(await io.inventory()) !== JSON.stringify(before))
        throw new Error('Identidad PostgreSQL modificada');
    };
    try {
      await io.activate(target);
      await io.health(target);
      await sameDatabase();
    } catch {
      try {
        await sameDatabase();
        await io.compatible(state.current);
        await io.activate(state.current);
        await io.health(state.current);
        await sameDatabase();
        state.pending = null;
        await io.saveState(state);
        await io.audit({
          result: 'rolled_back',
          sha: target.sha,
          previous: state.current.sha,
          runId: request.runId,
        });
      } catch {
        await io.audit({
          result: 'recovery_required',
          sha: target.sha,
          previous: state.current.sha,
          runId: request.runId,
        });
      }
      throw new Error('Despliegue fallido; consultar estado privado');
    }
    const old = state.current;
    state.current = target;
    if (!recovering) state.previous = old;
    state.lastRunId = request.runId;
    state.pending = null;
    await io.saveState(state);
    const result =
      request.operation === 'rollback' ? 'rolled_back' : 'deployed';
    await io.audit({
      result,
      sha: target.sha,
      previous: old.sha,
      runId: request.runId,
    });
    return { result, sha: target.sha };
  } finally {
    await unlock();
  }
}
