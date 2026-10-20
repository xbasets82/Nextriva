import { randomBytes } from 'node:crypto';

const namespace = randomBytes(8).toString('hex');
export function fixtureEmail(name: string): string {
  return `${name}-${namespace}@example.test`;
}
