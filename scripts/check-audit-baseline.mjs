import { readFile } from 'node:fs/promises';
import { evaluateAudit } from './audit-baseline.mjs';

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`Falta la opción requerida ${name}.`);
  }
  return process.argv[index + 1];
}

try {
  const [reportPath, baselinePath, exitCodeText] = [
    readOption('--report'),
    readOption('--baseline'),
    readOption('--audit-exit-code'),
  ];
  const exitCode = Number(exitCodeText);
  const [reportText, baselineText] = await Promise.all([
    readFile(reportPath, 'utf8'),
    readFile(baselinePath, 'utf8'),
  ]);
  const result = evaluateAudit({
    report: reportText,
    auditExitCode: exitCode,
    baseline: JSON.parse(baselineText),
  });

  for (const accepted of result.accepted) {
    console.warn(
      `TEMPORARILY ACCEPTED ${accepted.ghsa} | ${accepted.package}@${accepted.version} | ${accepted.severity} | ${accepted.path} | expires ${accepted.expiresAt} | ${accepted.justification}`,
    );
  }
  for (const error of result.errors)
    console.error(`AUDIT BASELINE ERROR: ${error}`);

  if (!result.ok) process.exitCode = 1;
  else
    console.log(
      `Audit baseline passed: ${result.accepted.length} temporary exception(s).`,
    );
} catch (error) {
  console.error(`AUDIT BASELINE ERROR: ${error.message}`);
  process.exitCode = 1;
}
