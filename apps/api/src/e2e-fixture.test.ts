import { expect, it, vi } from 'vitest';

it('keeps a stable worker identity and avoids email collisions after a worker restart', async () => {
  const first = await import('../e2e/fixture-email.js');
  const email = first.fixtureEmail('admin');
  expect(first.fixtureEmail('admin')).toBe(email);
  vi.resetModules();
  const restarted = await import('../e2e/fixture-email.js');
  expect(restarted.fixtureEmail('admin')).not.toBe(email);
  expect(restarted.fixtureEmail('admin')).toMatch(
    /^admin-[a-f0-9]{16}@example\.test$/,
  );
});
