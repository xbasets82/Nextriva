const REQUIRED_SEVERITIES = new Set(['low', 'moderate', 'high', 'critical']);
const MAX_EXCEPTION_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const APPROVED_EXPIRY = '2026-11-18T12:00:00.000Z';
const APPROVED_EXCEPTION_KEYS = new Set([
  'GHSA-ggr8-5vv4-36mx\u0000deepmerge-ts\u00007.1.5\u0000apps__api>prisma>@prisma/config>deepmerge-ts\u0000high',
  'GHSA-3f6p-5ww8-9rcr\u0000mysql2\u00003.15.3\u0000apps__api>prisma>mysql2\u0000high',
  'GHSA-rgwj-5xj2-c3m3\u0000mysql2\u00003.15.3\u0000apps__api>prisma>mysql2\u0000moderate',
]);

function fail(message) {
  return { ok: false, accepted: [], errors: [message] };
}

function validBaseline(baseline, now) {
  if (
    !baseline ||
    baseline.version !== 1 ||
    !Array.isArray(baseline.exceptions)
  ) {
    return 'Baseline inválido: se esperaba version 1 y una lista de excepciones.';
  }

  const keys = new Set();
  for (const exception of baseline.exceptions) {
    if (
      !exception ||
      typeof exception.ghsa !== 'string' ||
      !/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(exception.ghsa) ||
      typeof exception.package !== 'string' ||
      typeof exception.version !== 'string' ||
      typeof exception.path !== 'string' ||
      !REQUIRED_SEVERITIES.has(exception.severity) ||
      typeof exception.justification !== 'string' ||
      exception.justification.trim().length === 0 ||
      typeof exception.expiresAt !== 'string' ||
      Number.isNaN(Date.parse(exception.expiresAt))
    ) {
      return 'Baseline inválido: cada excepción debe identificar GHSA, paquete, versión, ruta, severidad, justificación y caducidad.';
    }

    const expiry = Date.parse(exception.expiresAt);
    if (exception.expiresAt !== APPROVED_EXPIRY) {
      return `La caducidad de ${exception.ghsa} cambió y requiere revisión explícita: ${exception.expiresAt}.`;
    }
    if (expiry <= now.getTime()) {
      return `Excepción caducada o sin margen: ${exception.ghsa} (${exception.expiresAt}).`;
    }
    if (expiry - now.getTime() > MAX_EXCEPTION_AGE_MS) {
      return `Excepción supera el máximo de 30 días y requiere revisión: ${exception.ghsa} (${exception.expiresAt}).`;
    }

    const key = `${exception.ghsa}\0${exception.package}\0${exception.version}\0${exception.path}`;
    if (keys.has(key))
      return `Baseline inválido: excepción duplicada para ${exception.ghsa}.`;
    const approvedKey = `${exception.ghsa}\0${exception.package}\0${exception.version}\0${exception.path}\0${exception.severity}`;
    if (!APPROVED_EXCEPTION_KEYS.has(approvedKey)) {
      return `Baseline contiene una excepción no aprobada o con versión/ruta/severidad modificada: ${exception.ghsa}.`;
    }
    keys.add(key);
  }

  return null;
}

function parseReport(report) {
  if (typeof report === 'string') {
    try {
      return JSON.parse(report);
    } catch {
      return null;
    }
  }
  return report;
}

function validateReport(parsed) {
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    !Array.isArray(parsed.actions) ||
    !parsed.advisories ||
    typeof parsed.advisories !== 'object' ||
    Array.isArray(parsed.advisories) ||
    !Array.isArray(parsed.muted) ||
    !parsed.metadata?.vulnerabilities ||
    typeof parsed.metadata.vulnerabilities !== 'object' ||
    parsed.error
  ) {
    return 'Informe pnpm audit inválido o incompleto.';
  }
  return null;
}

function readSeverityCounts(expectedCounts) {
  const counts = Object.fromEntries(
    ['info', 'low', 'moderate', 'high', 'critical'].map((severity) => [
      severity,
      0,
    ]),
  );
  for (const [severity, count] of Object.entries(expectedCounts)) {
    if (
      !Object.hasOwn(counts, severity) ||
      !Number.isInteger(count) ||
      count < 0
    ) {
      return { error: 'Informe pnpm audit contiene contadores inválidos.' };
    }
    counts[severity] = count;
  }
  for (const severity of Object.keys(counts)) {
    if (!Object.hasOwn(expectedCounts, severity)) {
      return {
        error: `Informe pnpm audit incompleto: falta el contador ${severity}.`,
      };
    }
  }
  return { counts };
}

function validateAdvisory(advisory, advisoryKey) {
  if (
    !advisory ||
    typeof advisory !== 'object' ||
    typeof advisory.module_name !== 'string' ||
    typeof advisory.github_advisory_id !== 'string' ||
    !REQUIRED_SEVERITIES.has(advisory.severity) ||
    !Array.isArray(advisory.findings) ||
    advisory.findings.length === 0
  ) {
    return `Informe pnpm audit contiene un aviso incompleto: ${advisoryKey}.`;
  }
  return null;
}

function validateFinding(finding, advisoryKey) {
  if (
    !finding ||
    typeof finding.version !== 'string' ||
    !Array.isArray(finding.paths) ||
    finding.paths.length === 0 ||
    finding.paths.some((path) => typeof path !== 'string' || path.length === 0)
  ) {
    return `Informe pnpm audit contiene una incidencia incompleta: ${advisoryKey}.`;
  }
  return null;
}

function inspectFindings(advisories, exceptionByKey) {
  const accepted = [];
  const errors = [];
  const observedCounts = Object.fromEntries(
    ['info', 'low', 'moderate', 'high', 'critical'].map((severity) => [
      severity,
      0,
    ]),
  );
  let observedCount = 0;

  for (const [advisoryKey, advisory] of Object.entries(advisories)) {
    const advisoryError = validateAdvisory(advisory, advisoryKey);
    if (advisoryError) return { error: advisoryError };

    for (const finding of advisory.findings) {
      const findingError = validateFinding(finding, advisoryKey);
      if (findingError) return { error: findingError };

      for (const path of finding.paths) {
        observedCount += 1;
        observedCounts[advisory.severity] += 1;
        const key = `${advisory.github_advisory_id}\0${advisory.module_name}\0${finding.version}\0${path}\0${advisory.severity}`;
        const exception = exceptionByKey.get(key);
        if (!exception) {
          errors.push(
            `Vulnerabilidad no aprobada o cambiada: ${advisory.github_advisory_id} ${advisory.module_name}@${finding.version} (${advisory.severity}) vía ${path}.`,
          );
          continue;
        }
        accepted.push({
          ghsa: exception.ghsa,
          package: exception.package,
          version: exception.version,
          path: exception.path,
          severity: exception.severity,
          expiresAt: exception.expiresAt,
          justification: exception.justification,
        });
      }
    }
  }
  return { accepted, errors, observedCount, observedCounts };
}

function checkReportConsistency(counts, observedCounts, observedCount) {
  const errors = [];
  const countedFindings = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (countedFindings !== observedCount) {
    errors.push(
      `Informe inconsistente: metadatos declaran ${countedFindings} avisos y se observaron ${observedCount}.`,
    );
  }
  for (const severity of Object.keys(counts)) {
    if (counts[severity] !== observedCounts[severity]) {
      errors.push(
        `Informe inconsistente para ${severity}: metadatos declaran ${counts[severity]} y se observaron ${observedCounts[severity]}.`,
      );
    }
  }
  return errors;
}

export function evaluateAudit({
  report,
  auditExitCode,
  baseline,
  now = new Date(),
}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return fail('Fecha de evaluación inválida.');
  }
  const baselineError = validBaseline(baseline, now);
  if (baselineError) return fail(baselineError);

  const parsed = parseReport(report);
  const reportError = validateReport(parsed);
  if (reportError) return fail(reportError);
  if (!Number.isInteger(auditExitCode) || ![0, 1].includes(auditExitCode)) {
    return fail(
      `pnpm audit terminó con código no aceptable: ${String(auditExitCode)}.`,
    );
  }

  const countsResult = readSeverityCounts(parsed.metadata.vulnerabilities);
  if (countsResult.error) return fail(countsResult.error);
  const counts = countsResult.counts;
  const exceptionByKey = new Map(
    baseline.exceptions.map((entry) => [
      `${entry.ghsa}\0${entry.package}\0${entry.version}\0${entry.path}\0${entry.severity}`,
      entry,
    ]),
  );
  const findingsResult = inspectFindings(parsed.advisories, exceptionByKey);
  if (findingsResult.error) return fail(findingsResult.error);
  const { accepted, errors, observedCount, observedCounts } = findingsResult;
  errors.push(...checkReportConsistency(counts, observedCounts, observedCount));

  const expectedExitCode = observedCount === 0 ? 0 : 1;
  if (auditExitCode !== expectedExitCode) {
    errors.push(
      `Código de pnpm audit inconsistente: se esperaba ${expectedExitCode} y se recibió ${auditExitCode}.`,
    );
  }
  return { ok: errors.length === 0, accepted, errors };
}
