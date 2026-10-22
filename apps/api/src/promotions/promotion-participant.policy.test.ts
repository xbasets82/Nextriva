import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertParticipantAdditionAllowed,
  assertParticipantManagement,
  assertPromotionVisible,
  type ParticipantActor,
} from './promotion-participant.policy.js';

const admin: ParticipantActor = { role: 'ADMIN', isActive: true };
const manager: ParticipantActor = { role: 'MANAGER', isActive: true };
const collaborator: ParticipantActor = { role: 'COLLABORATOR', isActive: true };

function statusOf(operation: () => void): number | undefined {
  try {
    operation();
    return undefined;
  } catch (error) {
    if (error instanceof HttpException) return error.getStatus();
    throw error;
  }
}

describe('I04.1 promotion visibility policy', () => {
  it('allows an active ADMIN to read any promotion without a link', () => {
    expect(() => assertPromotionVisible(admin, false)).not.toThrow();
  });

  it.each([manager, collaborator])(
    'allows linked $role to read the promotion',
    (actor) => {
      expect(() => assertPromotionVisible(actor, true)).not.toThrow();
    },
  );

  it.each([manager, collaborator])(
    'returns 404 to unlinked $role, including a guessed UUID',
    (actor) => {
      expect(statusOf(() => assertPromotionVisible(actor, false))).toBe(404);
    },
  );

  it.each([admin, manager, collaborator])(
    'denies inactive $role even when previously linked',
    (actor) => {
      expect(
        statusOf(() =>
          assertPromotionVisible({ ...actor, isActive: false }, true),
        ),
      ).toBe(403);
    },
  );
});

describe('I04.1 participant addition eligibility', () => {
  it('allows an active user to join an active promotion', () => {
    expect(() =>
      assertParticipantAdditionAllowed({ isActive: true }, 'ACTIVE'),
    ).not.toThrow();
  });

  it.each([undefined, { isActive: false }])(
    'rejects unavailable or inactive target %j with the same safe 409',
    (target) => {
      expect(
        statusOf(() => assertParticipantAdditionAllowed(target, 'ACTIVE')),
      ).toBe(409);
      expect(() => assertParticipantAdditionAllowed(target, 'ACTIVE')).toThrow(
        'El participante no se puede vincular',
      );
    },
  );

  it('rejects new links to an archived promotion with 409', () => {
    expect(
      statusOf(() =>
        assertParticipantAdditionAllowed({ isActive: true }, 'ARCHIVED'),
      ),
    ).toBe(409);
  });
});

describe('I04.1 participant management policy', () => {
  it.each([admin, manager, collaborator])(
    'allows ADMIN to manage a $role participant globally',
    (target) => {
      expect(() =>
        assertParticipantManagement(admin, false, target),
      ).not.toThrow();
    },
  );

  it('allows a linked MANAGER to manage a COLLABORATOR', () => {
    expect(() =>
      assertParticipantManagement(manager, true, {
        role: 'COLLABORATOR',
        isActive: true,
      }),
    ).not.toThrow();
  });

  it('denies a linked MANAGER from removing an inactive COLLABORATOR', () => {
    expect(
      statusOf(() =>
        assertParticipantManagement(manager, true, {
          role: 'COLLABORATOR',
          isActive: false,
        }),
      ),
    ).toBe(409);
  });

  it.each([admin, manager])(
    'denies MANAGER managing $role with 403 on a visible promotion',
    (target) => {
      expect(
        statusOf(() => assertParticipantManagement(manager, true, target)),
      ).toBe(403);
    },
  );

  it.each([admin, manager, collaborator])(
    'denies COLLABORATOR managing $role with 403 on a visible promotion',
    (target) => {
      expect(
        statusOf(() => assertParticipantManagement(collaborator, true, target)),
      ).toBe(403);
    },
  );

  it.each([manager, collaborator])(
    'hides an unrelated promotion from $role before checking the action',
    (actor) => {
      expect(
        statusOf(() =>
          assertParticipantManagement(actor, false, {
            role: 'COLLABORATOR',
            isActive: true,
          }),
        ),
      ).toBe(404);
    },
  );

  it.each([admin, manager, collaborator])(
    'denies management by inactive $role',
    (actor) => {
      expect(
        statusOf(() =>
          assertParticipantManagement({ ...actor, isActive: false }, true, {
            role: 'COLLABORATOR',
            isActive: true,
          }),
        ),
      ).toBe(403);
    },
  );
});
