import { expect, it } from 'vitest';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_PRIORITIES,
  incidentId,
  newIncidentComment,
  newIncident,
  newIncidentSolutionDraft,
  newIncidentSolutionSubmission,
  newIncidentSolutionRejection,
  incidentListQuery,
} from './incident.validation.js';
import { PROMOTION_PHASES } from '../promotions/promotion.validation.js';
const valid = {
  promotionId: 'a49c2e44-e455-4bbe-b9ce-7baee79c9893',
  originPhase: 'PLANNING',
  title: 'Título de prueba',
  description: 'Descripción de prueba',
  category: 'STRUCTURE',
  priority: 'MEDIUM',
};
it('accepts every approved category, priority and global phase without requiring current phase records', () => {
  for (const category of INCIDENT_CATEGORIES)
    for (const priority of INCIDENT_PRIORITIES)
      for (const originPhase of PROMOTION_PHASES)
        expect(
          newIncident({ ...valid, category, priority, originPhase }),
        ).toMatchObject({ category, priority, originPhase });
});
it('normalizes outer whitespace and accepts exact text boundaries', () => {
  expect(
    newIncident({
      ...valid,
      title: '  abcde  ',
      description: '  0123456789  ',
    }),
  ).toMatchObject({ title: 'abcde', description: '0123456789' });
  expect(
    newIncident({
      ...valid,
      title: 'a'.repeat(150),
      description: 'a'.repeat(5000),
    }).title,
  ).toHaveLength(150);
});
it.each([
  null,
  [],
  'invalid',
  3,
  {},
  { ...valid, title: null },
  { ...valid, description: 3 },
  { ...valid, promotionId: null },
  { ...valid, title: '   ' },
  { ...valid, originPhase: null },
  { ...valid, category: null },
  { ...valid, priority: null },
])('rejects malformed creation payload %#', (body) => {
  expect(() => newIncident(body)).toThrow('Datos de incidencia inválidos');
});
it('accepts UUID identifiers and rejects malformed identifiers', () => {
  expect(incidentId(valid.promotionId)).toBe(valid.promotionId);
  expect(() => incidentId('x')).toThrow();
});

it('Issue 117 accepts only the approved incident sort keys and directions', () => {
  expect(
    incidentListQuery({ sortBy: 'priority', sortDirection: 'asc' }),
  ).toMatchObject({
    sortBy: 'priority',
    sortDirection: 'asc',
    page: 1,
    pageSize: 20,
  });
  for (const query of [
    { sortBy: 'publicCode', sortDirection: 'asc' },
    { sortBy: 'status', sortDirection: 'sideways' },
    { sortDirection: 'asc' },
  ])
    expect(() => incidentListQuery(query)).toThrow(
      'Datos de incidencia inválidos',
    );
});

it('Issue 117 defaults a selected sort field to descending and rejects direction alone', () => {
  expect(incidentListQuery({ sortBy: 'priority' })).toMatchObject({
    sortBy: 'priority',
    sortDirection: 'desc',
  });
  expect(() => incidentListQuery({ sortDirection: 'asc' })).toThrow(
    'Datos de incidencia inválidos',
  );
});

it('validates incident comment text and its 2000-character limit', () => {
  expect(newIncidentComment({ body: '  Comentario  ' })).toEqual({
    body: 'Comentario',
  });
  expect(newIncidentComment({ body: 'a'.repeat(2000) }).body).toHaveLength(
    2000,
  );
  for (const body of ['', '   ', 'a'.repeat(2001)])
    expect(() => newIncidentComment({ body })).toThrow(
      'Datos de incidencia inválidos',
    );
  expect(() =>
    newIncidentComment({ body: 'válido', authorId: 'forged' }),
  ).toThrow('Datos de incidencia inválidos');
});

it('accepts empty or non-empty solution drafts with an expected version', () => {
  expect(newIncidentSolutionDraft({ solution: '', version: 1 })).toEqual({
    solution: '',
    version: 1,
  });
  expect(
    newIncidentSolutionDraft({ solution: 'Solución', version: 2 }),
  ).toEqual({ solution: 'Solución', version: 2 });
  expect(
    newIncidentSolutionDraft({ solution: 'a'.repeat(5000), version: 1 }),
  ).toHaveProperty('solution.length', 5000);
});

it('counts Unicode code points rather than UTF-16 surrogate units for solution limits', () => {
  const solution = '😀'.repeat(2501);
  expect(newIncidentSolutionDraft({ solution, version: 1 }).solution).toBe(
    solution,
  );
  expect(() =>
    newIncidentSolutionDraft({ solution: '😀'.repeat(5001), version: 1 }),
  ).toThrow('Datos de incidencia inválidos');
});

it.each([
  { solution: 'a'.repeat(5001), version: 1 },
  { solution: null, version: 1 },
  { solution: 'válida', version: 0 },
  { solution: 'válida', version: 1.5 },
  { solution: 'válida', version: 1, actorId: 'forged' },
  { solution: 'válida' },
])('rejects invalid solution draft payload %#', (body) => {
  expect(() => newIncidentSolutionDraft(body)).toThrow(
    'Datos de incidencia inválidos',
  );
});

it('accepts only an expected version for solution submission', () => {
  expect(newIncidentSolutionSubmission({ version: 3 })).toEqual({ version: 3 });
  for (const body of [
    null,
    {},
    { version: 0 },
    { version: 1.5 },
    { version: 1, solution: 'forged' },
  ])
    expect(() => newIncidentSolutionSubmission(body)).toThrow(
      'Datos de incidencia inválidos',
    );
});

it('validates a trimmed rejection reason and exact version without accepting server-owned fields', () => {
  for (const length of [5, 2000])
    expect(
      newIncidentSolutionRejection({
        version: 1,
        reason: `  ${'a'.repeat(length)}  `,
      }),
    ).toEqual({ version: 1, reason: 'a'.repeat(length) });
  for (const input of [
    null,
    [],
    {},
    { version: 1 },
    { version: 0, reason: 'válido' },
    { version: 1.5, reason: 'válido' },
    { version: 1, reason: '    ' },
    { version: 1, reason: 'abcd' },
    { version: 1, reason: 'a'.repeat(2001) },
    { version: 1, reason: 5 },
    { version: 1, reason: 'válido', actorId: 'forged' },
  ])
    expect(() => newIncidentSolutionRejection(input)).toThrow();
});

it('I07.3 counts rejection reason Unicode code points consistently with the API maxLength contract', () => {
  expect(
    newIncidentSolutionRejection({ version: 1, reason: '😀'.repeat(2000) })
      .reason,
  ).toBe('😀'.repeat(2000));
  expect(() =>
    newIncidentSolutionRejection({ version: 1, reason: '😀'.repeat(4) }),
  ).toThrow();
  expect(() =>
    newIncidentSolutionRejection({ version: 1, reason: '😀'.repeat(2001) }),
  ).toThrow();
});
