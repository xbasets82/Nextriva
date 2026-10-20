import { useRef, useState, type FormEvent } from 'react';
import { createUser, errorMessage, type NewUser } from '../api/users.js';

const fields = [
  ['firstName', 'Nombre', 'text', 2, 100],
  ['lastName', 'Apellidos', 'text', 2, 150],
  ['email', 'Email', 'email', 1, 320],
  ['password', 'Contraseña inicial', 'password', 1, 1024],
] as const;
export function CreateUserForm({
  onSaved,
  onCancel,
}: {
  onSaved: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const invalid = Array.from(form.querySelectorAll('input')).filter(
      (input) =>
        !input.checkValidity() ||
        (input.type === 'password' ? input.value : input.value.trim()).length <
          input.minLength,
    );
    setErrors(invalid.map((input) => input.name));
    if (invalid.length) {
      setMessage('Revisa los campos indicados.');
      invalid[0]?.focus();
      return;
    }
    const values = new FormData(form);
    const role = values.get('role');
    if (role !== 'ADMIN' && role !== 'MANAGER' && role !== 'COLLABORATOR') {
      setMessage('Revisa el rol seleccionado.');
      return;
    }
    const input: NewUser = {
      firstName: String(values.get('firstName')).trim(),
      lastName: String(values.get('lastName')).trim(),
      email: String(values.get('email')).trim(),
      role,
      password: String(values.get('password')),
    };
    const passwordField = form.elements.namedItem('password');
    if (passwordField instanceof HTMLInputElement) passwordField.value = '';
    setBusy(true);
    setMessage('');
    try {
      await createUser(input);
      onSaved();
    } catch (failure) {
      setMessage(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function cancel() {
    const dirty =
      ref.current &&
      Array.from(new FormData(ref.current)).some(
        ([name, value]) => value !== (name === 'role' ? 'COLLABORATOR' : ''),
      );
    if (!dirty || window.confirm('¿Descartar cambios sin guardar?')) onCancel();
  }
  return (
    <form
      ref={ref}
      aria-label="Crear usuario"
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-busy={busy}
      className="space-y-4 rounded-xl border p-4"
    >
      <h3 className="text-lg font-semibold">Crear usuario</h3>
      {message && <p role="alert">{message}</p>}
      <fieldset disabled={busy} className="grid gap-3">
        <legend className="sr-only">Datos del usuario</legend>
        {fields.map(([name, label, type, min, max]) => (
          <div key={name}>
            <label htmlFor={`create-${name}`} className="block">
              {label}
            </label>
            <input
              id={`create-${name}`}
              name={name}
              type={type}
              minLength={min}
              maxLength={max}
              required
              autoFocus={name === 'firstName'}
              autoComplete={name === 'password' ? 'new-password' : 'off'}
              aria-invalid={errors.includes(name)}
              aria-describedby={
                errors.includes(name) ? `error-${name}` : undefined
              }
              className="w-full rounded border bg-background p-2"
            />
            {errors.includes(name) && (
              <p id={`error-${name}`}>
                {type === 'email'
                  ? 'Introduce un email válido.'
                  : `${label}: entre ${min} y ${max} caracteres.`}
              </p>
            )}
          </div>
        ))}
        <label htmlFor="create-role">Rol</label>
        <select
          id="create-role"
          name="role"
          defaultValue="COLLABORATOR"
          className="rounded border bg-background p-2"
        >
          <option value="ADMIN">Administrador</option>
          <option value="MANAGER">Gestor</option>
          <option value="COLLABORATOR">Colaborador</option>
        </select>
        <button type="submit">{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" onClick={cancel}>
          Cancelar
        </button>
      </fieldset>
    </form>
  );
}
