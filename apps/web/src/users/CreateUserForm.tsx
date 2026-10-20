import { useRef, useState, type FormEvent, type RefObject } from 'react';
import {
  createUser,
  editUser,
  errorMessage,
  type NewUser,
  type User,
} from '../api/users.js';

const fields = [
  ['firstName', 'Nombre', 'text', 2, 100],
  ['lastName', 'Apellidos', 'text', 2, 150],
  ['email', 'Email', 'email', 1, 320],
  ['password', 'Contraseña inicial', 'password', 1, 1024],
] as const;
export function confirmDiscard(form: HTMLFormElement | null): boolean {
  const dirty =
    form &&
    Array.from(form.querySelectorAll('input, select')).some((field) => {
      if (field instanceof HTMLInputElement)
        return field.value !== field.defaultValue;
      if (field instanceof HTMLSelectElement)
        return (
          field.value !==
          Array.from(field.options).find((option) => option.defaultSelected)
            ?.value
        );
      return false;
    });
  return !dirty || window.confirm('¿Descartar cambios sin guardar?');
}
export function CreateUserForm({
  user,
  formRef,
  onBusy,
  onSaved,
  onCancel,
}: {
  user: User | undefined;
  formRef?: RefObject<HTMLFormElement | null>;
  onBusy?: (busy: boolean) => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const title = user ? 'Editar usuario' : 'Crear usuario';
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
    const input: Omit<NewUser, 'password'> = {
      firstName: String(values.get('firstName')).trim(),
      lastName: String(values.get('lastName')).trim(),
      email: String(values.get('email')).trim(),
      role,
    };
    const passwordField = form.elements.namedItem('password');
    if (passwordField instanceof HTMLInputElement) passwordField.value = '';
    setBusy(true);
    onBusy?.(true);
    setMessage('');
    try {
      if (user) await editUser(user.id, input);
      else
        await createUser({
          ...input,
          password: String(values.get('password')),
        });
      onSaved();
    } catch (failure) {
      setMessage(errorMessage(failure));
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  function cancel() {
    if (confirmDiscard(ref.current)) onCancel();
  }
  return (
    <form
      ref={(element) => {
        ref.current = element;
        if (formRef) formRef.current = element;
      }}
      aria-label={title}
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-busy={busy}
      className="space-y-4 rounded-xl border p-4"
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      {message && <p role="alert">{message}</p>}
      <fieldset disabled={busy} className="grid gap-3">
        <legend className="sr-only">Datos del usuario</legend>
        {fields
          .filter(([name]) => !user || name !== 'password')
          .map(([name, label, type, min, max]) => (
            <div key={name}>
              <label htmlFor={`create-${name}`} className="block">
                {label}
              </label>
              <input
                id={`create-${name}`}
                name={name}
                defaultValue={user && name !== 'password' ? user[name] : ''}
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
          defaultValue={user?.role ?? 'COLLABORATOR'}
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
