import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { evaluateAudit } from './audit-baseline.mjs';

const now = new Date('2026-10-19T12:00:00.000Z');
const exceptions = [
  {
    ghsa: 'GHSA-ggr8-5vv4-36mx',
    package: 'deepmerge-ts',
    version: '7.1.5',
    path: 'apps__api>prisma>@prisma/config>deepmerge-ts',
    severity: 'high',
    justification:
      'Dependencia transitiva de Prisma pendiente de revisión en #18.',
    expiresAt: '2026-11-18T12:00:00.000Z',
  },
  {
    ghsa: 'GHSA-3f6p-5ww8-9rcr',
    package: 'mysql2',
    version: '3.15.3',
    path: 'apps__api>prisma>mysql2',
    severity: 'high',
    justification:
      'Dependencia transitiva de Prisma; la aplicación usa PostgreSQL. #18.',
    expiresAt: '2026-11-18T12:00:00.000Z',
  },
  {
    ghsa: 'GHSA-rgwj-5xj2-c3m3',
    package: 'mysql2',
    version: '3.15.3',
    path: 'apps__api>prisma>mysql2',
    severity: 'moderate',
    justification:
      'Dependencia transitiva de Prisma; no se usa compresión MySQL. #18.',
    expiresAt: '2026-11-18T12:00:00.000Z',
  },
];
const repositoryBaseline = JSON.parse(
  await readFile(
    new URL('../.github/audit-baseline.json', import.meta.url),
    'utf8',
  ),
);
const approvedMulterException = {
  ghsa: 'GHSA-q7qp-rjg7-q26m',
  package: 'multer',
  version: '2.4.0',
  path: 'apps__api>@nestjs/platform-express>multer',
  severity: 'high',
  expiresAt: '2026-11-23T00:00:00.000Z',
  justification:
    'Excepción temporal hasta que @nestjs/platform-express publique una versión compatible que dependa de multer >=2.5.0. Nextriva no tiene rutas de subida ni fileFilter asíncronos. Revisar releases de NestJS semanalmente, retirar la excepción apenas exista actualización corregida y no incorporar flujos de subida mientras siga vigente.',
};

function baseline(entries = []) {
  return { version: 1, exceptions: structuredClone(entries) };
}

function reportFor(findings = exceptions) {
  const vulnerabilities = {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
  };
  const advisories = Object.fromEntries(
    findings.map((finding, index) => {
      vulnerabilities[finding.severity] += 1;
      return [
        String(index + 1),
        {
          module_name: finding.package,
          github_advisory_id: finding.ghsa,
          url: `https://github.com/advisories/${finding.ghsa}`,
          severity: finding.severity,
          findings: [{ version: finding.version, paths: [finding.path] }],
        },
      ];
    }),
  );
  return { actions: [], advisories, muted: [], metadata: { vulnerabilities } };
}

function evaluate(report = reportFor(), options = {}) {
  return evaluateAudit({
    report,
    auditExitCode: 1,
    baseline: baseline(),
    now,
    ...options,
  });
}

function assertRejected(result) {
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.length > 0,
    'Debe explicar por qué falla el control.',
  );
}

test('acepta un informe limpio con código de auditoría cero', () => {
  const result = evaluate(reportFor([]), { auditExitCode: 0 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.errors, []);
});

test('el baseline del repositorio contiene solo la excepción temporal aprobada de Multer', () => {
  assert.deepEqual(repositoryBaseline.exceptions, [approvedMulterException]);
});

test('acepta únicamente el aviso Multer aprobado antes de su vencimiento', () => {
  const finding = {
    ghsa: approvedMulterException.ghsa,
    package: approvedMulterException.package,
    version: approvedMulterException.version,
    path: approvedMulterException.path,
    severity: approvedMulterException.severity,
  };
  const result = evaluate(reportFor([finding]), {
    baseline: baseline([approvedMulterException]),
    now: new Date('2026-10-24T00:00:00.000Z'),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.accepted, [approvedMulterException]);
});

test('rechaza la excepción Multer una vez vencida', () => {
  const finding = {
    ghsa: approvedMulterException.ghsa,
    package: approvedMulterException.package,
    version: approvedMulterException.version,
    path: approvedMulterException.path,
    severity: approvedMulterException.severity,
  };
  const result = evaluate(reportFor([finding]), {
    baseline: baseline([approvedMulterException]),
    now: new Date(approvedMulterException.expiresAt),
  });
  assertRejected(result);
  assert.match(result.errors.join(' '), /vencida|expirada/i);
});

test('rechaza avisos Multer con una versión, ruta, paquete, GHSA o severidad diferentes', () => {
  for (const [key, value] of [
    ['ghsa', 'GHSA-2222-3333-4444'],
    ['package', 'other-package'],
    ['version', '2.5.0'],
    ['path', 'apps__api>other-adapter>multer'],
    ['severity', 'moderate'],
  ]) {
    const finding = { ...approvedMulterException, [key]: value };
    const result = evaluate(reportFor([finding]), {
      baseline: baseline([approvedMulterException]),
    });
    assertRejected(result);
  }
});

test('rechaza una excepción con campos, vencimiento o justificación alterados', () => {
  for (const altered of [
    { ...approvedMulterException, expiresAt: '2027-01-01T00:00:00.000Z' },
    { ...approvedMulterException, justification: '' },
    { ...approvedMulterException, note: 'unexpected field' },
  ]) {
    assertRejected(
      evaluate(reportFor([]), {
        baseline: baseline([altered]),
        auditExitCode: 0,
      }),
    );
  }
});

test('rechaza excepciones adicionales aunque la excepción Multer sea válida', () => {
  assertRejected(
    evaluate(reportFor([]), {
      baseline: baseline([
        approvedMulterException,
        { ...approvedMulterException, ghsa: 'GHSA-2222-3333-4444' },
      ]),
      auditExitCode: 0,
    }),
  );
});

test('rechaza elementos nulos o malformados en la lista de excepciones', () => {
  for (const malformed of [null, 'not-an-exception', 17, []]) {
    assertRejected(
      evaluate(reportFor([]), {
        baseline: baseline([malformed]),
        auditExitCode: 0,
      }),
    );
  }
});

test('rechaza la reintroducción de cualquiera de los tres GHSA resueltos', () => {
  for (const exception of exceptions) {
    assertRejected(
      evaluate(reportFor([exception]), {
        baseline: baseline([exception]),
      }),
    );
  }
});

test('rechaza los avisos resueltos mientras reaparezcan en el informe de auditoría', () => {
  assertRejected(evaluate(reportFor(exceptions)));
});

test('rechaza una vulnerabilidad no aprobada aunque conserve paquete, versión y ruta', () => {
  const changed = structuredClone(exceptions);
  changed[0].ghsa = 'GHSA-2222-3333-4444';
  assertRejected(evaluate(reportFor(changed)));
});

test('rechaza excepciones añadidas al baseline sin aprobar', () => {
  const changedBaseline = baseline();
  const newException = {
    ...structuredClone(exceptions[0]),
    ghsa: 'GHSA-2222-3333-4444',
  };
  changedBaseline.exceptions.push(newException);
  const result = evaluate(reportFor([newException]), {
    baseline: changedBaseline,
  });
  assertRejected(result);
  assert.match(result.errors[0], /no coincide con la aprobación temporal/);
});

test('permite que la excepción aprobada exista aunque su aviso no aparezca', () => {
  const result = evaluate(reportFor([]), {
    baseline: baseline([approvedMulterException]),
    auditExitCode: 0,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.accepted, []);
});

for (const auditExitCode of [2, 127, null]) {
  test(`rechaza un error de ejecución de auditoría con código ${auditExitCode}`, () => {
    assertRejected(evaluate(reportFor(), { auditExitCode }));
  });
}

test('rechaza código cero cuando el informe contiene vulnerabilidades', () => {
  assertRejected(evaluate(reportFor(), { auditExitCode: 0 }));
});

test('rechaza código uno cuando el informe no contiene vulnerabilidades', () => {
  assertRejected(evaluate(reportFor([])));
});

for (const report of [
  null,
  {},
  [],
  { error: { code: 'ENOTFOUND' } },
  '{invalid JSON',
]) {
  test(`rechaza el informe inválido ${JSON.stringify(report)}`, () => {
    assertRejected(evaluate(report));
  });
}

test('rechaza un informe truncado sin metadatos', () => {
  const report = reportFor();
  delete report.metadata;
  assertRejected(evaluate(report));
});

test('rechaza un informe sin los campos estructurales de pnpm audit', () => {
  const report = reportFor();
  delete report.actions;
  assertRejected(evaluate(report));
});

test('rechaza un objeto de error aunque incluya metadatos aparentemente válidos', () => {
  const report = reportFor();
  report.error = { code: 'ENOTFOUND' };
  assertRejected(evaluate(report));
});

test('rechaza un informe cuyos contadores ocultan un aviso', () => {
  const report = reportFor();
  report.metadata.vulnerabilities.critical = 1;
  assertRejected(evaluate(report));
});

for (const field of ['module_name', 'severity', 'findings']) {
  test(`rechaza un aviso incompleto sin ${field}`, () => {
    const report = reportFor();
    delete report.advisories['1'][field];
    assertRejected(evaluate(report));
  });
}
