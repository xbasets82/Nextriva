import { describe, expect, it } from 'vitest';
import {
  newPromotion,
  participantUserId,
  promotionChanges,
  promotionId,
  promotionStatus,
} from './promotion.validation.js';

const validPromotion = () => ({
  name: 'Residencial Nextriva',
  description: 'Promoción sintética',
  location: 'Madrid',
  phases: ['PLANNING', 'CONSTRUCTION'],
});

describe('I04.1 participant input validation', () => {
  const userId = '00000000-0000-4000-8000-000000000001';

  it('accepts only a user UUID and preserves the identity', () => {
    expect(participantUserId({ userId })).toBe(userId);
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { userId: null },
    { userId: 1 },
    { userId: '' },
    { userId: 'not-a-uuid' },
    { userId: '00000000-0000-0000-0000-000000000001' },
    { userId, role: 'ADMIN' },
    { userId, promotionId: userId },
    { userId, joinedAt: '2026-10-22T00:00:00Z' },
  ])('rejects invalid or non-allowlisted membership input %j', (body) => {
    expect(() => participantUserId(body)).toThrow(
      'Datos de promoción inválidos',
    );
  });
});

describe('promotion input validation', () => {
  it.each([
    null,
    [],
    2,
    {},
    { ...validPromotion(), name: 'AB' },
    { ...validPromotion(), name: 'a'.repeat(151) },
    { ...validPromotion(), description: 'a'.repeat(1001) },
    { ...validPromotion(), location: 'a'.repeat(201) },
    { ...validPromotion(), extra: 'forbidden' },
    { ...validPromotion(), phases: [] },
    { ...validPromotion(), phases: ['UNKNOWN'] },
    { ...validPromotion(), phases: ['PLANNING', 'PLANNING'] },
  ])('rejects invalid promotion creation input %j', (body) => {
    expect(() => newPromotion(body)).toThrow('Datos de promoción inválidos');
  });

  it('trims valid create fields and preserves the approved phase order', () => {
    expect(
      newPromotion({
        name: ' Residencial Nextriva ',
        description: ' Síntesis ',
        location: ' Madrid ',
        phases: ['AFTER_SALES', 'PLANNING', 'CONSTRUCTION'],
      }),
    ).toEqual({
      name: 'Residencial Nextriva',
      description: 'Síntesis',
      location: 'Madrid',
      phases: ['PLANNING', 'CONSTRUCTION', 'AFTER_SALES'],
    });
  });

  it.each([
    {},
    { phases: [] },
    { phases: ['UNKNOWN'] },
    { phases: ['HANDOVER', 'HANDOVER'] },
    { status: 'ARCHIVED' },
    { id: 'forbidden' },
  ])('rejects invalid promotion edits %j', (body) => {
    expect(() => promotionChanges(body)).toThrow(
      'Datos de promoción inválidos',
    );
  });

  it('accepts only known status values and UUID identifiers', () => {
    expect(promotionStatus({ status: 'ARCHIVED' })).toBe('ARCHIVED');
    expect(promotionId('00000000-0000-4000-8000-000000000001')).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(() => promotionStatus({ status: 'DELETED' })).toThrow(
      'Datos de promoción inválidos',
    );
    expect(() => promotionId('invalid')).toThrow(
      'Datos de promoción inválidos',
    );
  });
});
