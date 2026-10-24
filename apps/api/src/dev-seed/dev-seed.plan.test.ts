import { expect, it } from 'vitest';
import { makeSeedPlan, seedId } from './dev-seed.plan.js';

it('preserves the existing default fixture and extends profiles additively', () => {
  const small = makeSeedPlan(60);
  const medium = makeSeedPlan(150, 'medium');
  const large = makeSeedPlan(300, 'large');

  expect([
    small.users.length,
    small.promotions.length,
    small.incidents.length,
  ]).toEqual([12, 5, 60]);
  expect([
    medium.users.length,
    medium.promotions.length,
    medium.incidents.length,
  ]).toEqual([20, 10, 150]);
  expect([
    large.users.length,
    large.promotions.length,
    large.incidents.length,
  ]).toEqual([30, 15, 300]);
  expect(large.comments.length).toBeGreaterThanOrEqual(600);
  expect(large.comments.length).toBeLessThanOrEqual(900);
  expect(medium.users.slice(0, 12)).toEqual(small.users);
  expect(medium.promotions.slice(0, 5)).toEqual(small.promotions);
  expect(medium.incidents.slice(0, 60)).toEqual(small.incidents);
  expect(large.incidents.slice(0, 150)).toEqual(medium.incidents);
  expect(large.comments.slice(0, medium.comments.length)).toEqual(
    medium.comments,
  );
  expect(large.activities.slice(0, medium.activities.length)).toEqual(
    medium.activities,
  );
  expect(small.incidents[0]?.id).toBe(seedId('incident', 0));
  expect(large.incidents[60]?.promotionId).toBe(large.promotions[5]?.id);
  expect(large.incidents[150]?.promotionId).toBe(large.promotions[10]?.id);
  expect(makeSeedPlan(300, 'large')).toEqual(large);
});

it('generates only implemented states, phases, event types and valid actors', () => {
  const plan = makeSeedPlan(300, 'large');
  const participants = new Set(
    plan.participants.map((item) => `${item.promotionId}:${item.userId}`),
  );
  const users = new Map(plan.users.map((item) => [item.id, item]));
  const incidents = new Map(plan.incidents.map((item) => [item.id, item]));
  const promotions = new Map(plan.promotions.map((item) => [item.id, item]));
  expect(new Set(plan.incidents.map((item) => item.status))).toEqual(
    new Set(['OPEN', 'IN_PROGRESS', 'PENDING_VALIDATION', 'CLOSED']),
  );
  expect(new Set(plan.incidents.map((item) => item.category)).size).toBe(9);
  expect(new Set(plan.incidents.map((item) => item.priority)).size).toBe(3);
  expect(new Set(plan.incidents.map((item) => item.originPhase)).size).toBe(7);
  expect(plan.incidents.some((item) => item.assignedToId === null)).toBe(true);
  expect(
    plan.incidents.some(
      (item) => item.solution !== null && item.status === 'IN_PROGRESS',
    ),
  ).toBe(true);
  expect(
    plan.promotions.some(
      (promotion) =>
        !plan.incidents.some((item) => item.promotionId === promotion.id),
    ),
  ).toBe(true);
  const rejections = plan.activities.filter(
    (activity) =>
      activity.eventType === 'STATUS_CHANGED' &&
      activity.changes.previousStatus === 'PENDING_VALIDATION' &&
      activity.changes.status === 'IN_PROGRESS',
  );
  expect(rejections.length).toBeGreaterThan(0);
  const twiceRejected = plan.incidents.find(
    (incident) =>
      rejections.filter((activity) => activity.incidentId === incident.id)
        .length >= 2,
  );
  expect(twiceRejected).toBeDefined();
  const twoRejections = rejections.filter(
    (activity) => activity.incidentId === twiceRejected?.id,
  );
  expect(
    new Set(twoRejections.map((activity) => activity.changes.solution)).size,
  ).toBeGreaterThanOrEqual(2);
  expect(twoRejections[0]!.createdAt.getTime()).toBeLessThan(
    twoRejections[1]!.createdAt.getTime(),
  );
  expect(
    rejections.some(
      (activity) =>
        plan.activities.filter(
          (entry) =>
            entry.incidentId === activity.incidentId &&
            entry.eventType === 'SOLUTION_SUBMITTED',
        ).length > 1,
    ),
  ).toBe(true);
  for (const rejection of rejections) {
    expect(rejection.changes.solution).toBeTruthy();
    expect(rejection.changes.solutionSubmittedById).toBeTruthy();
    expect(rejection.changes.solutionSubmittedAt).toBeTruthy();
    expect(rejection.changes.reason?.length).toBeGreaterThanOrEqual(5);
    expect(rejection.actorId).not.toBe(rejection.changes.solutionSubmittedById);
  }

  for (const incident of plan.incidents) {
    expect(promotions.has(incident.promotionId)).toBe(true);
    expect(users.has(incident.createdById)).toBe(true);
    if (incident.assignedToId) {
      expect(users.get(incident.assignedToId)?.isActive).toBe(true);
      expect(
        participants.has(`${incident.promotionId}:${incident.assignedToId}`),
      ).toBe(true);
    }
    if (incident.status === 'CLOSED') {
      expect(incident.validatedById).toBeTruthy();
      expect(incident.validatedById).not.toBe(incident.solutionSubmittedById);
      expect(incident.closedAt).toBeTruthy();
      const closingActivity = plan.activities.find(
        (activity) =>
          activity.incidentId === incident.id &&
          activity.eventType === 'STATUS_CHANGED' &&
          activity.changes.status === 'CLOSED',
      );
      expect(closingActivity?.actorId).toBe(incident.validatedById);
      expect(closingActivity?.createdAt).toEqual(incident.closedAt);
    }
  }
  for (const activity of plan.activities) {
    expect(incidents.has(activity.incidentId)).toBe(true);
    expect(users.has(activity.actorId)).toBe(true);
    if (activity.eventType === 'COMMENT_ADDED') {
      expect(
        plan.comments.some(
          (comment) => comment.id === activity.changes.commentId,
        ),
      ).toBe(true);
    }
  }
  for (const comment of plan.comments) {
    const incident = incidents.get(comment.incidentId)!;
    expect(comment.createdAt.getTime()).toBeGreaterThanOrEqual(
      incident.createdAt.getTime(),
    );
    if (incident.closedAt)
      expect(comment.createdAt.getTime()).toBeLessThan(
        incident.closedAt.getTime(),
      );
    expect(
      plan.activities.some(
        (activity) =>
          activity.eventType === 'COMMENT_ADDED' &&
          activity.changes.commentId === comment.id &&
          activity.actorId === comment.authorId &&
          activity.createdAt.getTime() === comment.createdAt.getTime(),
      ),
    ).toBe(true);
  }
});
