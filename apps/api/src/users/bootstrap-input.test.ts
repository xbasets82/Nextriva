import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { expect, it } from 'vitest';
import { readBootstrapInput } from './bootstrap-input.js';
const password = randomBytes(24).toString('base64url');
const input = {
  firstName: 'Inicial',
  lastName: 'Administrador',
  email: ' ADMIN@Example.Test ',
  password,
};
it('reads a credential from stdin only, normalizes it and fixes the first role to ADMIN', async () => {
  await expect(
    readBootstrapInput(Readable.from([JSON.stringify(input)])),
  ).resolves.toEqual({ ...input, email: 'admin@example.test', role: 'ADMIN' });
});
it.each([
  'not-json',
  JSON.stringify({ ...input, role: 'ADMIN' }),
  JSON.stringify({ ...input, id: 'forbidden' }),
  JSON.stringify({ ...input, password: '' }),
  ' '.repeat(8193),
])(
  'rejects invalid bootstrap input without disclosing its contents',
  async (source) => {
    await expect(readBootstrapInput(Readable.from([source]))).rejects.toThrow(
      'Entrada de aprovisionamiento inválida',
    );
  },
);
