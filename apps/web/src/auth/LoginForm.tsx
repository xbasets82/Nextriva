import { useEffect, useRef, useState, type FormEvent } from 'react';
import { login, loginError } from '../api/auth.js';
import type { User } from '../api/users.js';
import { Card, CardContent } from '../components/ui/card.js';

export function LoginForm({
  onAuthenticated,
}: {
  onAuthenticated: (user: User) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [failure, setFailure] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    form.current?.querySelector<HTMLInputElement>('#login-email')?.focus();
    return () => {
      active.current = false;
      form.current?.reset();
    };
  }, []);
  useEffect(() => {
    if (failure) alert.current?.focus();
  }, [failure]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const email =
      event.currentTarget.querySelector<HTMLInputElement>('#login-email')!;
    const password =
      event.currentTarget.querySelector<HTMLInputElement>('#login-password')!;
    const next = {
      email:
        !email.value.trim() || !email.validity.valid
          ? 'Introduce un email válido.'
          : '',
      password:
        !password.value || password.value.length > 1024
          ? 'Introduce la contraseña.'
          : '',
    };
    setErrors(next);
    setFailure('');
    if (next.email || next.password) {
      (next.email ? email : password).focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const user = await login({
        email: email.value.trim(),
        password: password.value,
      });
      if (active.current) onAuthenticated(user);
    } catch (error) {
      if (active.current) setFailure(loginError(error));
    } finally {
      password.value = '';
      pending.current = false;
      if (active.current) {
        setBusy(false);
        setVisible(false);
      }
    }
  }
  return (
    <Card className="mx-auto w-full max-w-md border-border/80 shadow-sm">
      <CardContent>
        <form
          ref={form}
          aria-label="Iniciar sesión"
          aria-busy={busy}
          noValidate
          onSubmit={(event) => void submit(event)}
          className="space-y-5"
        >
          <div className="grid gap-3">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={320}
              disabled={busy}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              className="block h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {errors.email && (
              <p
                id="login-email-error"
                role="alert"
                className="text-destructive"
              >
                {errors.email}
              </p>
            )}
          </div>
          <div className="grid gap-3">
            <label htmlFor="login-password">Contraseña</label>
            <div className="relative">
              <input
                id="login-password"
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete="current-password"
                required
                maxLength={1024}
                disabled={busy}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? 'login-password-error' : undefined
                }
                className="block h-11 w-full rounded-md border border-input bg-background px-3 pr-12 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="button"
                disabled={busy}
                aria-label={
                  visible ? 'Ocultar contraseña' : 'Mostrar contraseña'
                }
                aria-pressed={visible}
                aria-controls="login-password"
                onClick={() => setVisible((value) => !value)}
                className="absolute inset-y-0 right-1 inline-flex w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
              >
                <svg
                  aria-hidden="true"
                  focusable="false"
                  data-icon={visible ? 'eye-off' : 'eye'}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5"
                >
                  <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
                  <circle cx="12" cy="12" r="3" />
                  {visible && <path d="m4 4 16 16" />}
                </svg>
              </button>
            </div>
            {errors.password && (
              <p
                id="login-password-error"
                role="alert"
                className="text-destructive"
              >
                {errors.password}
              </p>
            )}
          </div>
          {failure && (
            <p
              ref={alert}
              tabIndex={-1}
              role="alert"
              className="text-destructive"
            >
              {failure}
            </p>
          )}
          {busy && <p role="status">Iniciando sesión…</p>}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-11 w-full items-center justify-center rounded-md action-primary px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Iniciar sesión
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
