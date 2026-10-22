import { expect, it } from 'vitest';
import {
  assertAssignmentAllowed,
  assertEligibleAssignee,
  incidentAssignment,
  assignmentActivity,
} from './incident.assignment.js';
const id = '00000000-0000-4000-8000-000000000001';
it('accepts only a non-null assignee UUID and a positive integer expected version', () => {
  expect(incidentAssignment({ assignedToId: id, version: 1 })).toEqual({
    assignedToId: id,
    version: 1,
  });
  for (const input of [
    null,
    [],
    {},
    { assignedToId: null, version: 1 },
    { assignedToId: 'bad', version: 1 },
    { assignedToId: id, version: 0 },
    { assignedToId: id, version: 1.5 },
    { assignedToId: id, version: '1' },
    { assignedToId: id, version: 1, status: 'OPEN' },
  ])
    expect(() => incidentAssignment(input)).toThrow(
      'Datos de asignación inválidos',
    );
});
it('allows ADMIN and MANAGER only in active promotions with OPEN or IN_PROGRESS incidents', () => {
  for (const role of ['ADMIN', 'MANAGER'] as const)
    for (const status of ['OPEN', 'IN_PROGRESS'])
      expect(() =>
        assertAssignmentAllowed(role, status, 'ACTIVE'),
      ).not.toThrow();
  expect(() =>
    assertAssignmentAllowed('COLLABORATOR', 'OPEN', 'ACTIVE'),
  ).toThrow('Operación no permitida');
  for (const status of ['PENDING_VALIDATION', 'CLOSED'])
    expect(() => assertAssignmentAllowed('ADMIN', status, 'ACTIVE')).toThrow(
      'La incidencia no admite asignación',
    );
  expect(() => assertAssignmentAllowed('ADMIN', 'OPEN', 'ARCHIVED')).toThrow(
    'La incidencia no admite asignación',
  );
});
it('requires an active linked assignee except active global ADMIN', () => {
  for (const role of ['MANAGER', 'COLLABORATOR', 'ADMIN'] as const)
    expect(() =>
      assertEligibleAssignee({ role, isActive: true }, true),
    ).not.toThrow();
  expect(() =>
    assertEligibleAssignee({ role: 'ADMIN', isActive: true }, false),
  ).not.toThrow();
  for (const target of [
    undefined,
    { role: 'COLLABORATOR' as const, isActive: false },
    { role: 'ADMIN' as const, isActive: false },
    { role: 'MANAGER' as const, isActive: true },
    { role: 'COLLABORATOR' as const, isActive: true },
  ])
    expect(() => assertEligibleAssignee(target, false)).toThrow(
      'Responsable no elegible',
    );
});

it('produces assignment event snapshots but no event for the current assignee', () => {
  const other = '00000000-0000-4000-8000-000000000002';
  expect(assignmentActivity(null, id)).toEqual({
    eventType: 'ASSIGNED',
    changes: { previousAssignedToId: null, assignedToId: id },
  });
  expect(assignmentActivity(id, other)).toEqual({
    eventType: 'REASSIGNED',
    changes: { previousAssignedToId: id, assignedToId: other },
  });
  expect(assignmentActivity(id, id)).toBeUndefined();
});

it('canonicalizes case-insensitive UUID identities before deciding whether an assignment changes', () => {
  const canonical = 'a49c2e44-e455-4bbe-b9ce-7baee79c9893';
  expect(
    incidentAssignment({ assignedToId: canonical.toUpperCase(), version: 2 }),
  ).toEqual({ assignedToId: canonical, version: 2 });
});
