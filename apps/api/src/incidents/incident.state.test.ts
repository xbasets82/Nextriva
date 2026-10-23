import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { assertIncidentTransition } from './incident.state.js';

const actorId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const base = {
  actorId,
  actorRole: 'MANAGER' as const,
  promotionStatus: 'ACTIVE',
  assignedToId: otherId,
  presentedById: otherId,
  solution: 'Solución comprobada',
  hasIndependentValidator: true,
  rejectionReason: 'Falta una comprobación',
};

describe('política de cuatro estados', () => {
  it.each([
    ['OPEN', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'PENDING_VALIDATION'],
    ['PENDING_VALIDATION', 'IN_PROGRESS'],
    ['PENDING_VALIDATION', 'CLOSED'],
  ])('permite %s → %s cuando se satisfacen sus condiciones', (from, to) => {
    expect(() =>
      assertIncidentTransition({
        ...base,
        from,
        to,
        actorId: from === 'IN_PROGRESS' ? otherId : actorId,
      }),
    ).not.toThrow();
  });

  it.each([
    ['OPEN', 'OPEN'],
    ['OPEN', 'PENDING_VALIDATION'],
    ['OPEN', 'CLOSED'],
    ['IN_PROGRESS', 'OPEN'],
    ['IN_PROGRESS', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'CLOSED'],
    ['PENDING_VALIDATION', 'OPEN'],
    ['PENDING_VALIDATION', 'PENDING_VALIDATION'],
    ['CLOSED', 'OPEN'],
    ['CLOSED', 'IN_PROGRESS'],
    ['CLOSED', 'PENDING_VALIDATION'],
    ['CLOSED', 'CLOSED'],
    ['UNKNOWN', 'IN_PROGRESS'],
    ['OPEN', 'UNKNOWN'],
    ['toString', 'IN_PROGRESS'],
    ['OPEN', '__proto__'],
  ])('rechaza %s → %s', (from, to) => {
    expect(() => assertIncidentTransition({ ...base, from, to })).toThrow();
  });

  it.each([
    ['toString', 'IN_PROGRESS'],
    ['OPEN', '__proto__'],
  ])('rechaza el estado heredado %s → %s con HTTP 400', (from, to) => {
    expect(() => assertIncidentTransition({ ...base, from, to })).toThrow(
      BadRequestException,
    );
  });

  it('exige responsable, promoción activa y actor autorizado para iniciar', () => {
    for (const change of [
      { assignedToId: null },
      { promotionStatus: 'ARCHIVED' },
      { actorRole: 'COLLABORATOR' as const },
    ])
      expect(() =>
        assertIncidentTransition({
          ...base,
          ...change,
          from: 'OPEN',
          to: 'IN_PROGRESS',
        }),
      ).toThrow();
    expect(() =>
      assertIncidentTransition({
        ...base,
        actorId: otherId,
        actorRole: 'COLLABORATOR',
        from: 'OPEN',
        to: 'IN_PROGRESS',
      }),
    ).not.toThrow();
  });

  it('exige al responsable, solución y validador independiente para enviar', () => {
    for (const change of [
      { actorId },
      { solution: '' },
      { hasIndependentValidator: false },
    ])
      expect(() =>
        assertIncidentTransition({
          ...base,
          ...change,
          from: 'IN_PROGRESS',
          to: 'PENDING_VALIDATION',
        }),
      ).toThrow();
  });

  it('impide autovalidación y exige motivo para rechazo', () => {
    for (const to of ['IN_PROGRESS', 'CLOSED']) {
      expect(() =>
        assertIncidentTransition({
          ...base,
          actorId: otherId,
          from: 'PENDING_VALIDATION',
          to,
        }),
      ).toThrow();
      expect(() =>
        assertIncidentTransition({
          ...base,
          actorRole: 'COLLABORATOR',
          from: 'PENDING_VALIDATION',
          to,
        }),
      ).toThrow();
    }
    expect(() =>
      assertIncidentTransition({
        ...base,
        rejectionReason: 'x',
        from: 'PENDING_VALIDATION',
        to: 'IN_PROGRESS',
      }),
    ).toThrow();
    expect(() =>
      assertIncidentTransition({
        ...base,
        presentedById: null,
        from: 'PENDING_VALIDATION',
        to: 'CLOSED',
      }),
    ).toThrow();
  });
});
