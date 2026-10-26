import { expect, it } from 'vitest';
import {
  approvedCycleSnapshot,
  incidentReopenInput,
} from './incident.reopen.js';

const assignedToId = '00000000-0000-4000-8000-000000000001';
it('validates the strict required reopen fields and Unicode reason boundaries', () => {
  const input = { version: 1, reason: '  Valid reason  ', assignedToId };
  expect(incidentReopenInput(input)).toEqual({
    ...input,
    reason: 'Valid reason',
  });
  expect(
    incidentReopenInput({ ...input, reason: '😀'.repeat(5) }).reason,
  ).toHaveLength(10);
  expect(
    incidentReopenInput({ ...input, reason: '😀'.repeat(2000) }).reason,
  ).toHaveLength(4000);
  for (const body of [
    undefined,
    null,
    [],
    'text',
    {},
    { ...input, version: 0 },
    { ...input, version: 1.5 },
    { ...input, version: Number.MAX_SAFE_INTEGER + 1 },
    { ...input, assignedToId: null },
    { ...input, assignedToId: undefined },
    { ...input, assignedToId: 'invalid' },
    { version: 1, assignedToId },
    { ...input, reason: null },
    { ...input, reason: '    ' },
    { ...input, reason: '😀'.repeat(4) },
    { ...input, reason: '😀'.repeat(2001) },
    { ...input, solution: 'server-controlled' },
  ])
    expect(() => incidentReopenInput(body)).toThrow();
});
const approved = {
  solution: '  Texto exacto aprobado  ',
  solutionSubmittedById: assignedToId,
  solutionSubmittedAt: new Date('2026-10-24T10:00:00Z'),
  validatedById: '00000000-0000-4000-8000-000000000002',
  closedAt: new Date('2026-10-25T10:00:00Z'),
};
it('preserves exact approved data as JSON values without aliasing mutable dates', () => {
  const snapshot = approvedCycleSnapshot(approved);
  expect(snapshot).toEqual({
    ...approved,
    solutionSubmittedAt: '2026-10-24T10:00:00.000Z',
    closedAt: '2026-10-25T10:00:00.000Z',
  });
});
it.each([
  { solution: null },
  { solution: '    ' },
  { solutionSubmittedById: null },
  { solutionSubmittedAt: null },
  { validatedById: null },
  { closedAt: null },
  { validatedById: assignedToId },
])('rejects incomplete or non-independent closure metadata %#', (change) => {
  expect(() => approvedCycleSnapshot({ ...approved, ...change })).toThrow(
    'El cierre no dispone de metadatos históricos completos',
  );
});
