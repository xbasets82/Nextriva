import { describe, expect, it } from 'vitest';
import * as deletion from './incident.soft-delete.js';

describe('logical deletion policy', () => {
  it('accepts ADMIN and MANAGER only in approved states of active promotions', () => {
    for (const role of ['ADMIN', 'MANAGER'] as const)
      for (const status of ['OPEN', 'IN_PROGRESS', 'CLOSED'])
        expect(() =>
          deletion.assertIncidentDeletionAllowed(role, status, 'ACTIVE'),
        ).not.toThrow();
  });
  it('rejects collaborators, archived promotions, pending and unknown states', () => {
    expect(() =>
      deletion.assertIncidentDeletionAllowed('COLLABORATOR', 'OPEN', 'ACTIVE'),
    ).toThrow('Operación no permitida');
    for (const status of ['PENDING_VALIDATION', 'UNKNOWN'])
      expect(() =>
        deletion.assertIncidentDeletionAllowed('ADMIN', status, 'ACTIVE'),
      ).toThrow('La incidencia no admite eliminación');
    expect(() =>
      deletion.assertIncidentDeletionAllowed('MANAGER', 'CLOSED', 'ARCHIVED'),
    ).toThrow('La incidencia no admite eliminación');
  });
  it('validates version and trimmed Unicode reason without server-controlled fields', () => {
    expect(
      deletion.incidentDeletionInput({
        version: 1,
        reason: '  Motivo válido  ',
      }),
    ).toEqual({ version: 1, reason: 'Motivo válido' });
    expect(
      deletion.incidentDeletionInput({ version: 2, reason: '😀'.repeat(2000) })
        .reason,
    ).toBe('😀'.repeat(2000));
    for (const value of [
      null,
      [],
      {},
      { version: 0, reason: 'Motivo válido' },
      { version: 1.5, reason: 'Motivo válido' },
      { version: 1, reason: '    ' },
      { version: 1, reason: 'abcd' },
      { version: 1, reason: '😀'.repeat(2001) },
      { version: 1, reason: 'Motivo válido', deletedById: 'forged' },
    ])
      expect(() => deletion.incidentDeletionInput(value)).toThrow(
        'Datos de incidencia inválidos',
      );
  });
});
