import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { changePassword } from '../api/auth.js';
import { ApiError } from '../api/transport.js';

const actionClass =
  'inline-flex size-11 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none';
const fields = [
  {
    name: 'currentPassword',
    label: 'Contraseña actual',
    action: 'contraseña actual',
    autocomplete: 'current-password',
  },
  {
    name: 'newPassword',
    label: 'Nueva contraseña',
    action: 'nueva contraseña',
    autocomplete: 'new-password',
  },
  {
    name: 'confirmPassword',
    label: 'Confirmar nueva contraseña',
    action: 'confirmación de nueva contraseña',
    autocomplete: 'new-password',
  },
] as const;
type Field = (typeof fields)[number]['name'];

function validateInputs(inputs: Record<Field, HTMLInputElement>) {
  const errors: Partial<Record<Field, string>> = {};
  for (const { name } of fields) {
    if (!inputs[name].value || inputs[name].value.length > 1024)
      errors[name] = 'Introduce una contraseña de hasta 1.024 caracteres.';
  }
  if (inputs.newPassword.value !== inputs.confirmPassword.value)
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  if (
    inputs.newPassword.value &&
    inputs.newPassword.value === inputs.currentPassword.value
  )
    errors.newPassword = 'La nueva contraseña debe ser distinta de la actual.';
  return errors;
}
function passwordError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400)
    return 'No se pudo cambiar la contraseña. Revisa los datos.';
  if (error instanceof ApiError && error.status === 429)
    return 'Demasiados intentos. Inténtalo más tarde.';
  return 'No se pudo cambiar la contraseña. Inténtalo de nuevo.';
}

function Icon({
  kind,
}: {
  kind: 'lock-keyhole' | 'save' | 'x' | 'eye' | 'eye-off';
}) {
  const paths = {
    'lock-keyhole': 'M8 11V7a4 4 0 0 1 8 0v4 M5 11h14v10H5z M12 15v2',
    save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2 M7 3v6h10V3 M7 21v-8h10v8',
    x: 'm6 6 12 12 M6 18 18 6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    'eye-off': 'm3 3 18 18 M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7',
  };
  return (
    <svg
      aria-hidden="true"
      data-icon={kind}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d={paths[kind]} />
    </svg>
  );
}

export function PasswordChangeControl({
  disabled,
  onChanged,
  onBusy,
}: {
  disabled: boolean;
  onChanged: () => void;
  onBusy: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const tooltipOpen = (hovered || focused) && !dismissed && !open && !disabled;
  useEffect(() => {
    if (!tooltipOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [tooltipOpen]);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <span
        className="relative inline-flex"
        onMouseEnter={() => {
          setHovered(true);
          setDismissed(false);
        }}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlurCapture={() => setFocused(false)}
      >
        <button
          ref={trigger}
          type="button"
          aria-label="Cambiar contraseña"
          aria-describedby={tooltipId}
          disabled={disabled || open}
          className={actionClass}
          onClick={() => setOpen(true)}
        >
          <Icon kind="lock-keyhole" />
        </button>
        <span
          id={tooltipId}
          role="tooltip"
          hidden={!tooltipOpen}
          className="pointer-events-auto absolute right-0 top-full z-50 w-max max-w-48 rounded-md bg-foreground px-2 pb-1 pt-2 text-xs text-background"
        >
          Cambiar contraseña
        </span>
      </span>
      {open && (
        <PasswordDialog
          onBusy={onBusy}
          onChanged={onChanged}
          onCancel={() => {
            setOpen(false);
            queueMicrotask(() => trigger.current?.focus());
          }}
        />
      )}
    </>
  );
}
function PasswordDialog({
  onCancel,
  onChanged,
  onBusy,
}: {
  onCancel: () => void;
  onChanged: () => void;
  onBusy: (value: boolean) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState<Partial<Record<Field, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState('');
  const failureRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    mounted.current = true;
    const element = form.current;
    element?.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      mounted.current = false;
      element?.reset();
    };
  }, []);
  useEffect(() => {
    if (failure) failureRef.current?.focus();
  }, [failure]);
  useEffect(() => {
    if (busy) dialogRef.current?.focus();
  }, [busy]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const inputs = Object.fromEntries(
      fields.map(({ name }) => [
        name,
        form.current!.elements.namedItem(name) as HTMLInputElement,
      ]),
    ) as Record<Field, HTMLInputElement>;
    const nextErrors = validateInputs(inputs);
    setErrors(nextErrors);
    setFailure('');
    const invalid = fields.find(({ name }) => nextErrors[name]);
    if (invalid) {
      inputs[invalid.name].focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    onBusy(true);
    try {
      await changePassword({
        currentPassword: inputs.currentPassword.value,
        newPassword: inputs.newPassword.value,
        confirmPassword: inputs.confirmPassword.value,
      });
      if (mounted.current) onChanged();
    } catch (error) {
      if (mounted.current) setFailure(passwordError(error));
    } finally {
      form.current?.reset();
      pending.current = false;
      onBusy(false);
      if (mounted.current) {
        setBusy(false);
        setVisible({});
      }
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/30 p-4"
      role="presentation"
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-change-title"
        className="my-auto w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-sm"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (!pending.current) onCancel();
          }
          if (event.key === 'Tab') {
            const controls = event.currentTarget.querySelectorAll<HTMLElement>(
              'input:not(:disabled), button:not(:disabled), [tabindex="-1"]',
            );
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === failureRef.current)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            } else if (controls.length === 0) event.preventDefault();
          }
        }}
      >
        <h2 id="password-change-title" className="mb-5 text-lg font-semibold">
          Cambiar contraseña
        </h2>
        <form
          ref={form}
          aria-label="Cambiar contraseña"
          aria-busy={busy}
          noValidate
          onSubmit={(event) => void submit(event)}
          className="grid gap-5"
        >
          {fields.map(({ name, label, action, autocomplete }) => (
            <div key={name} className="grid gap-3">
              <label htmlFor={`change-${name}`}>{label}</label>
              <div className="relative">
                <input
                  id={`change-${name}`}
                  name={name}
                  type={visible[name] ? 'text' : 'password'}
                  autoComplete={autocomplete}
                  required
                  maxLength={1024}
                  disabled={busy}
                  aria-invalid={Boolean(errors[name])}
                  aria-describedby={errors[name] ? `error-${name}` : undefined}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 pr-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  disabled={busy}
                  aria-controls={`change-${name}`}
                  aria-label={`${visible[name] ? 'Ocultar' : 'Mostrar'} ${action}`}
                  aria-pressed={Boolean(visible[name])}
                  className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() =>
                    setVisible((value) => ({ ...value, [name]: !value[name] }))
                  }
                >
                  <Icon kind={visible[name] ? 'eye-off' : 'eye'} />
                </button>
              </div>
              {errors[name] && (
                <p
                  id={`error-${name}`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors[name]}
                </p>
              )}
            </div>
          ))}
          {failure && (
            <p
              ref={failureRef}
              tabIndex={-1}
              role="alert"
              className="text-sm text-destructive"
            >
              {failure}
            </p>
          )}
          {busy && <p role="status">Actualizando contraseña…</p>}
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              aria-label="Cancelar"
              title="Cancelar"
              disabled={busy}
              className={actionClass}
              onClick={onCancel}
            >
              <Icon kind="x" />
            </button>
            <button
              type="submit"
              aria-label="Guardar contraseña"
              title="Guardar contraseña"
              disabled={busy}
              className={actionClass}
            >
              <Icon kind="save" />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
