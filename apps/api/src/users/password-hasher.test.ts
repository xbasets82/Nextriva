import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PasswordHasher } from './password-hasher.js';

describe('PasswordHasher', () => {
  const password = randomBytes(24).toString('base64url');

  it('creates a salted Argon2id hash and verifies the original password', async () => {
    const hasher = new PasswordHasher();

    const hash = await hasher.hash(password);

    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    await expect(hasher.verify(hash, password)).resolves.toBe(true);
    await expect(hasher.verify(hash, `${password}-wrong`)).resolves.toBe(false);
  });

  it('generates a different salt for the same password', async () => {
    const hasher = new PasswordHasher();

    await expect(hasher.hash(password)).resolves.not.toBe(
      await hasher.hash(password),
    );
  });
});
