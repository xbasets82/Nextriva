import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deployRelease } from './cd-deploy.mjs';

const previous = {
  sha: 'b'.repeat(40),
  api: `ghcr.io/xbasets82/nextriva-api@sha256:${'b'.repeat(64)}`,
  web: `ghcr.io/xbasets82/nextriva-web@sha256:${'c'.repeat(64)}`,
};
const target = {
  sha: 'a'.repeat(40),
  api: `ghcr.io/xbasets82/nextriva-api@sha256:${'d'.repeat(64)}`,
  web: `ghcr.io/xbasets82/nextriva-web@sha256:${'e'.repeat(64)}`,
};
const request = {
  operation: 'deploy',
  ...target,
  ciRunId: 77,
  runId: 80,
  expectedSha: previous.sha,
};

function fixture() {
  let state = {
    version: 1,
    current: previous,
    previous: null,
    lastRunId: 70,
    pending: null,
  };
  const calls = [];
  let locked = false;
  const io = {
    async lock() {
      if (locked) {
        throw new Error('Bloqueado');
      }
      locked = true;
      return async () => {
        locked = false;
      };
    },
    async readState() {
      return structuredClone(state);
    },
    async saveState(value) {
      state = structuredClone(value);
      calls.push('save');
    },
    async authorize() {
      calls.push('authorize');
    },
    async inventory() {
      calls.push('inventory');
      return {
        databaseId: 'db-unchanged',
        volume: 'nextriva-demo_demo_database',
      };
    },
    async pull() {
      calls.push('pull');
    },
    async compatible() {
      calls.push('schema');
    },
    async activate(value) {
      calls.push(`activate:${value.sha}`);
    },
    async health(value) {
      calls.push(`health:${value.sha}`);
    },
    async audit(record) {
      calls.push(`audit:${record.result}`);
    },
  };
  return {
    io,
    calls,
    state: () => state,
    setState(value) {
      state = value;
    },
  };
}

test('publica candidata y guarda versión estable tras comprobar salud sin tocar DB', async () => {
  const f = fixture();
  assert.equal((await deployRelease(request, f.io)).result, 'deployed');
  assert.deepEqual(f.state().current, target);
  assert.deepEqual(f.state().previous, previous);
  assert.equal(f.state().pending, null);
  assert.equal(f.state().lastRunId, 80);
  assert.ok(
    f.calls.indexOf('schema') < f.calls.indexOf(`activate:${target.sha}`),
  );
});

test('CI, acceso, imagen o esquema inválidos abortan antes de activar', async () => {
  for (const operation of ['authorize', 'inventory', 'pull', 'compatible']) {
    const f = fixture();
    let invoked = false;
    f.io[operation] = async () => {
      invoked = true;
      throw new Error('Error simulado');
    };
    await assert.rejects(deployRelease(request, f.io), /CD despliegue fallido/);
    assert.equal(invoked, true);
    assert.equal(
      f.calls.some((x) => x.startsWith('activate:')),
      false,
    );
    assert.deepEqual(f.state().current, previous);
  }
});

test('rechaza versión esperada incorrecta y run obsoleto sin cambios', async () => {
  for (const patch of [{ expectedSha: 'f'.repeat(40) }, { runId: 69 }]) {
    const f = fixture();
    await assert.rejects(
      deployRelease({ ...request, ...patch }, f.io),
      /etapa=check-state categoría=state_conflict/,
    );
    assert.equal(f.calls.includes('pull'), false);
  }
});

test('fallo de salud revierte solo aplicaciones y conserva versión estable', async () => {
  const f = fixture();
  f.io.health = async (value) => {
    if (value.sha === target.sha) throw new Error('No saludable');
  };
  await assert.rejects(deployRelease(request, f.io));
  assert.ok(f.calls.includes(`activate:${previous.sha}`));
  assert.deepEqual(f.state().current, previous);
  assert.equal(f.state().pending, null);
  assert.ok(f.calls.includes('audit:rolled_back'));
});

test('fallo parcial de compose también revierte; rollback fallido deja bloqueo pendiente', async () => {
  const f = fixture();
  f.io.activate = async () => {
    throw new Error('Compose falla');
  };
  await assert.rejects(deployRelease(request, f.io));
  assert.equal(f.state().pending.sha, target.sha);
  assert.ok(f.calls.includes('audit:recovery_required'));
});

test('concurrencia usa barrera determinista y libera bloqueo al finalizar', async () => {
  const f = fixture();
  let entered;
  const barrier = new Promise((resolve) => {
    entered = resolve;
  });
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  f.io.pull = async () => {
    entered();
    await waiting;
  };
  const first = deployRelease(request, f.io);
  await barrier;
  await assert.rejects(deployRelease(request, f.io));
  release();
  await first;
  assert.equal(
    (await deployRelease({ ...request, expectedSha: target.sha }, f.io)).result,
    'already_deployed',
  );
});

test('rollback manual elige solo la versión previa guardada con esquema compatible', async () => {
  const f = fixture();
  f.setState({
    version: 1,
    current: target,
    previous,
    lastRunId: 80,
    pending: null,
  });
  const rollback = {
    operation: 'rollback',
    sha: target.sha,
    expectedSha: target.sha,
    ciRunId: 77,
    runId: 81,
  };
  assert.equal((await deployRelease(rollback, f.io)).result, 'rolled_back');
  assert.deepEqual(f.state().current, previous);
});

test('recuperar candidata pendiente conserva la versión estable anterior para otro rollback', async () => {
  const f = fixture();
  const pending = {
    sha: 'f'.repeat(40),
    api: `ghcr.io/xbasets82/nextriva-api@sha256:${'f'.repeat(64)}`,
    web: `ghcr.io/xbasets82/nextriva-web@sha256:${'f'.repeat(64)}`,
  };
  f.setState({
    version: 1,
    current: target,
    previous,
    lastRunId: 80,
    pending,
  });
  const rollback = {
    operation: 'rollback',
    sha: pending.sha,
    expectedSha: target.sha,
    ciRunId: 77,
    runId: 81,
  };
  assert.equal((await deployRelease(rollback, f.io)).result, 'rolled_back');
  assert.deepEqual(f.state().current, target);
  assert.deepEqual(f.state().previous, previous);
  assert.equal(f.state().pending, null);
  assert.equal(f.state().lastRunId, 81);
  assert.ok(f.calls.includes(`activate:${target.sha}`));
  assert.equal(f.calls.includes(`activate:${pending.sha}`), false);
});

test('cambio de identidad/volumen PostgreSQL bloquea confirmación y conserva journal', async () => {
  const f = fixture();
  let count = 0;
  f.io.inventory = async () => ({
    databaseId: ++count === 1 ? 'original' : 'changed',
    volume: 'same',
  });
  await assert.rejects(deployRelease(request, f.io));
  assert.equal(f.state().pending.sha, target.sha);
});

test('preflight informa etapa segura y descarta secretos antes de cualquier mutación', async () => {
  for (const [operation, phase] of [
    ['readState', 'read-state'],
    ['authorize', 'authorize'],
    ['inventory', 'inventory'],
    ['pull', 'pull-images'],
    ['compatible', 'check-schema'],
  ]) {
    const f = fixture();
    f.io[operation] = async () => {
      throw new Error('token=private-secret /etc/private');
    };
    await assert.rejects(deployRelease(request, f.io), (error) => {
      assert.equal(error.phase, phase);
      assert.equal(
        error.category,
        operation === 'authorize' ? 'policy_rejected' : 'operation_failed',
      );
      assert.doesNotMatch(error.message, /private-secret|\/etc\/private/);
      return true;
    });
    assert.equal(f.calls.includes('save'), false);
    assert.equal(
      f.calls.some((entry) => entry.startsWith('activate:')),
      false,
    );
    assert.deepEqual(f.state().current, previous);
  }
});

test('fallo de candidata conserva diagnóstico y resultado de recuperación seguro', async () => {
  for (const recoveryFails of [false, true]) {
    const f = fixture();
    f.io.health = async (release) => {
      if (release.sha === target.sha || recoveryFails)
        throw new Error('secret-health-response');
    };
    await assert.rejects(deployRelease(request, f.io), (error) => {
      assert.equal(error.phase, 'health');
      assert.equal(error.category, 'operation_failed');
      assert.equal(error.recovery, recoveryFails ? 'required' : 'succeeded');
      assert.doesNotMatch(error.message, /secret-health-response/);
      return true;
    });
    assert.deepEqual(f.state().current, previous);
    assert.equal(Boolean(f.state().pending), recoveryFails);
  }
});

test('rechazos de petición, bloqueo, persistencia y auditoría conservan fase sin volcar datos', async () => {
  for (const [operation, phase] of [
    ['lock', 'lock'],
    ['saveState', 'save-state'],
    ['audit', 'audit'],
  ]) {
    const f = fixture();
    f.io[operation] = async () => {
      throw new Error('secret-command-output');
    };
    await assert.rejects(deployRelease(request, f.io), (error) => {
      assert.equal(error.phase, phase);
      assert.doesNotMatch(error.message, /secret-command-output/);
      return true;
    });
  }
  const f = fixture();
  await assert.rejects(
    deployRelease({ ...request, token: 'secret' }, f.io),
    (error) => {
      assert.equal(error.phase, 'validate-request');
      assert.equal(error.category, 'policy_rejected');
      return true;
    },
  );
  assert.equal(f.calls.length, 0);
});

test('auditoría de recuperación fallida no sustituye el diagnóstico primario', async () => {
  for (const recoveryFails of [false, true]) {
    const f = fixture();
    f.io.health = async (release) => {
      if (release.sha === target.sha || recoveryFails)
        throw new Error('secret-primary-health');
    };
    f.io.audit = async () => {
      throw new Error('secret-audit');
    };
    await assert.rejects(deployRelease(request, f.io), (error) => {
      assert.equal(error.phase, 'health');
      assert.equal(error.category, 'operation_failed');
      assert.equal(error.recovery, 'required');
      assert.doesNotMatch(error.message, /secret-primary-health|secret-audit/);
      return true;
    });
    assert.deepEqual(f.state().current, previous);
    assert.equal(Boolean(f.state().pending), recoveryFails);
  }
});

test('fallo de unlock no sustituye el diagnóstico primario pero se informa si es único', async () => {
  for (const primaryFails of [false, true]) {
    const f = fixture();
    f.io.lock = async () => async () => {
      throw new Error('secret-unlock');
    };
    if (primaryFails)
      f.io.pull = async () => {
        throw new Error('secret-primary-pull');
      };
    await assert.rejects(deployRelease(request, f.io), (error) => {
      assert.equal(error.phase, primaryFails ? 'pull-images' : 'unlock');
      assert.equal(error.category, 'operation_failed');
      assert.doesNotMatch(error.message, /secret-primary-pull|secret-unlock/);
      return true;
    });
    assert.deepEqual(f.state().current, primaryFails ? previous : target);
  }
});
