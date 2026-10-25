import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import {
  createUser,
  editUser,
  errorMessage,
  setUserStatus,
  type NewUser,
  type User,
} from '../api/users.js';

export const userStatusCardClassName =
  'space-y-3 rounded-lg border border-border p-4';
const control =
  'h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export const userFormActionClassName =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none';
function FormIcon({
  kind,
}: {
  kind: 'save' | 'cancel' | 'eye' | 'eye-off' | 'active' | 'inactive';
}) {
  const paths = {
    save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8',
    cancel: 'm6 6 12 12M6 18 18 6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7ZM9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
    'eye-off': 'm3 3 18 18M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z',
    active:
      'm16 11 2 2 4-4M2 21v-2a7 7 0 0 1 14 0v2M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
    inactive:
      'm17 8 5 5M17 13l5-5M2 21v-2a7 7 0 0 1 14 0v2M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
  };
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-icon={kind}
      className="size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
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
  onRefresh,
  onCancel,
}: {
  user: User | undefined;
  formRef?: RefObject<HTMLFormElement | null>;
  onBusy?: (busy: boolean) => void;
  onSaved: () => Promise<void>;
  onRefresh: () => Promise<User[]>;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const pending = useRef(false);
  const [visible, setVisible] = useState(false);
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [confirmation, setConfirmation] = useState(false);
  const confirmationCancel = useRef<HTMLButtonElement>(null);
  const statusButton = useRef<HTMLButtonElement>(null);
  const restoreStatusFocus = useRef(false);
  useEffect(() => {
    if (confirmation) confirmationCancel.current?.focus();
    else if (!busy && restoreStatusFocus.current) {
      statusButton.current?.focus();
      restoreStatusFocus.current = false;
    }
  }, [confirmation, busy]);
  function dismissConfirmation() {
    restoreStatusFocus.current = true;
    setConfirmation(false);
  }
  async function refreshStatus() {
    const users = await onRefresh();
    const current = users.find((entry) => entry.id === user?.id);
    if (current) setIsActive(current.isActive);
  }
  async function changeStatus() {
    if (!user || pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusy?.(true);
    setMessage('');
    let applied = false;
    try {
      await setUserStatus(user.id, { isActive: !isActive });
      applied = true;
      setIsActive(!isActive);
      setConfirmation(false);
      await refreshStatus();
      setMessage(
        'Estado actualizado. Los cambios en los demás campos siguen sin guardar.',
      );
    } catch (failure) {
      setConfirmation(false);
      if (!applied) {
        try {
          await refreshStatus();
        } catch {
          /* El error original se comunica sin descartar el borrador. */
        }
      }
      setMessage(
        `${applied ? 'El estado se actualizó, pero no se pudo actualizar el listado. ' : ''}${errorMessage(failure)}`,
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy?.(false);
      restoreStatusFocus.current = true;
    }
  }
  async function retryRefresh() {
    pending.current = true;
    setBusy(true);
    onBusy?.(true);
    try {
      await onSaved();
    } catch (failure) {
      setMessage(
        `Los datos se guardaron, pero no se pudo actualizar el listado. ${errorMessage(failure)}`,
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  }
  const title = user ? 'Editar usuario' : 'Crear usuario';
  const saveLabel = profileSaved ? 'Actualizar listado' : 'Guardar';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || confirmation) return;
    if (profileSaved) {
      await retryRefresh();
      return;
    }
    const form = event.currentTarget;
    const invalid = Array.from(form.querySelectorAll('input')).filter(
      (input) =>
        !input.checkValidity() ||
        (input.name === 'password' ? input.value : input.value.trim()).length <
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
    pending.current = true;
    setBusy(true);
    onBusy?.(true);
    setMessage('');
    let applied = false;
    try {
      if (user) await editUser(user.id, input);
      else
        await createUser({
          ...input,
          password: String(values.get('password')),
        });
      applied = true;
      setProfileSaved(true);
      await onSaved();
    } catch (failure) {
      setMessage(
        `${applied ? 'Los datos se guardaron, pero no se pudo actualizar el listado. ' : ''}${errorMessage(failure)}`,
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  }
  function cancel() {
    if (profileSaved || confirmDiscard(ref.current)) onCancel();
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
      className="mx-auto w-full max-w-2xl space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      {message && <p role="alert">{message}</p>}
      <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
        <legend className="sr-only">Datos del usuario</legend>
        {fields
          .filter(([name]) => !user || name !== 'password')
          .map(([name, label, type, min, max]) => (
            <div
              key={name}
              className={`grid content-start gap-3 ${name === 'password' ? 'sm:col-span-2' : ''}`}
            >
              <label htmlFor={`create-${name}`} className="block">
                {label}
              </label>
              <div className="relative">
                <input
                  id={`create-${name}`}
                  name={name}
                  defaultValue={user && name !== 'password' ? user[name] : ''}
                  type={name === 'password' && visible ? 'text' : type}
                  minLength={min}
                  maxLength={max}
                  required
                  readOnly={profileSaved}
                  autoFocus={name === 'firstName'}
                  autoComplete={name === 'password' ? 'new-password' : 'off'}
                  aria-invalid={errors.includes(name)}
                  aria-describedby={
                    errors.includes(name) ? `error-${name}` : undefined
                  }
                  className={`${control} ${name === 'password' ? 'pr-12' : ''}`}
                />
                {name === 'password' && (
                  <button
                    type="button"
                    aria-label={
                      visible ? 'Ocultar contraseña' : 'Mostrar contraseña'
                    }
                    aria-pressed={visible}
                    aria-controls="create-password"
                    onClick={() => setVisible((value) => !value)}
                    className="absolute inset-y-0 right-1 inline-flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <FormIcon kind={visible ? 'eye-off' : 'eye'} />
                  </button>
                )}
              </div>
              {errors.includes(name) && (
                <p id={`error-${name}`}>
                  {type === 'email'
                    ? 'Introduce un email válido.'
                    : `${label}: entre ${min} y ${max} caracteres.`}
                </p>
              )}
            </div>
          ))}
        <div className="grid content-start gap-3">
          <label htmlFor="create-role">Rol</label>
          <div className="relative">
            <select
              id="create-role"
              name="role"
              disabled={profileSaved}
              defaultValue={user?.role ?? 'COLLABORATOR'}
              className={`${control} appearance-none pr-10`}
            >
              <option value="ADMIN">Administrador</option>
              <option value="MANAGER">Gestor</option>
              <option value="COLLABORATOR">Colaborador</option>
            </select>
            <svg
              aria-hidden="true"
              data-icon="chevron-down"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
        {user && (
          <div className="grid content-start gap-3">
            <span>Estado del usuario: {isActive ? 'Activo' : 'Inactivo'}</span>
            <button
              ref={statusButton}
              type="button"
              disabled={confirmation || profileSaved}
              aria-label={isActive ? 'Desactivar usuario' : 'Activar usuario'}
              onClick={() => setConfirmation(true)}
              className={`${userFormActionClassName} ${isActive ? 'border-destructive/40 text-destructive hover:bg-destructive/10' : ''}`}
            >
              <FormIcon kind={isActive ? 'inactive' : 'active'} />
              {isActive ? 'Desactivar' : 'Activar'}
            </button>
            <p className="text-sm text-muted-foreground">
              El cambio de estado se confirma y aplica por separado de Guardar.
            </p>
          </div>
        )}
        {confirmation && (
          <div
            role="alertdialog"
            aria-labelledby="edit-status-title"
            aria-describedby="edit-status-description"
            className={`${userStatusCardClassName} sm:col-span-2`}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !busy) {
                event.preventDefault();
                event.stopPropagation();
                dismissConfirmation();
              }
            }}
          >
            <h4 id="edit-status-title" className="font-medium">
              Confirmar cambio de estado
            </h4>
            <p id="edit-status-description">
              ¿{isActive ? 'Desactivar' : 'Activar'} a {user?.email}? La
              operación puede revocar sus sesiones. Los demás campos no se
              guardarán.
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                ref={confirmationCancel}
                type="button"
                className={userFormActionClassName}
                onClick={dismissConfirmation}
              >
                Cancelar cambio de estado
              </button>
              <button
                type="button"
                className={userFormActionClassName}
                onClick={() => void changeStatus()}
              >
                Confirmar {isActive ? 'desactivación' : 'activación'}
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4 sm:col-span-2">
          <button
            type="button"
            className={userFormActionClassName}
            disabled={confirmation}
            onClick={cancel}
          >
            <FormIcon kind="cancel" />
            Cancelar
          </button>
          <button
            type="submit"
            aria-label={profileSaved ? 'Actualizar listado' : 'Guardar usuario'}
            disabled={confirmation}
            className={`${userFormActionClassName} border-primary bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            <FormIcon kind="save" />
            {busy ? 'Guardando…' : saveLabel}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
