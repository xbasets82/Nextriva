import { expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { clientAddress, validateTrustedProxy } from './client-address.js';

function request(remoteAddress: string, forwarded?: string | string[]) {
  return {
    socket: { remoteAddress } as IncomingMessage['socket'],
    headers: { 'x-forwarded-for': forwarded },
  };
}

it('ignores spoofed headers from untrusted connections and without explicit trust', () => {
  expect(clientAddress(request('192.0.2.1', '192.0.2.2'), '127.0.0.1')).toBe(
    '192.0.2.1',
  );
  expect(clientAddress(request('127.0.0.1', '192.0.2.2'))).toBe('127.0.0.1');
});

it('uses exactly one valid address from the configured immediate hop', () => {
  expect(
    clientAddress(request(`::ffff:${'127.0.0.1'}`, '192.0.2.2'), '127.0.0.1'),
  ).toBe('192.0.2.2');
  for (const value of ['192.0.2.2, 192.0.2.3', 'unknown', '', ['192.0.2.2']]) {
    expect(clientAddress(request('127.0.0.1', value), '127.0.0.1')).toBe(
      '127.0.0.1',
    );
  }
});

it.each(['*', 'true', 'loopback', '127.0.0.1/8', '127.0.0.1,192.0.2.1', ''])(
  'rejects broad or ambiguous trust %s',
  (value) => {
    expect(() => validateTrustedProxy(value)).toThrow('única IP');
  },
);
