import { expect, it } from 'vitest';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_PRIORITIES,
  incidentId,
  newIncidentComment,
  newIncident,
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
