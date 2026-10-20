import {
  newManagedUser,
  type NewManagedUser,
} from './users-management.validation.js';
/** Entrada por stdin: evita credenciales en argumentos, historial y salida. */
export async function readBootstrapInput(
  stream: AsyncIterable<string | Buffer>,
): Promise<NewManagedUser> {
  try {
    let source = '';
    for await (const chunk of stream) {
      source += chunk.toString();
      if (Buffer.byteLength(source) > 8192) throw new Error('limit');
    }
    const body: unknown = JSON.parse(source);
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) => !['firstName', 'lastName', 'email', 'password'].includes(key),
      )
    )
      throw new Error('fields');
    return newManagedUser({ ...body, role: 'ADMIN' });
  } catch {
    throw new Error('Entrada de aprovisionamiento inválida');
  }
}
