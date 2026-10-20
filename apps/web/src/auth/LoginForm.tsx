import { useEffect, useRef, useState, type FormEvent } from 'react';
import { login, loginError } from '../api/auth.js';
import type { User } from '../api/users.js';
import { Card, CardHeader, CardContent } from '../components/ui/card.js';

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
    <Card>
      <CardHeader>
        <h2 className="text-2xl font-semibold">Iniciar sesión</h2>
      </CardHeader>
      <CardContent>
        <form
          ref={form}
          aria-label="Iniciar sesión"
          aria-busy={busy}
          noValidate
          onSubmit={(event) => void submit(event)}
          className="space-y-5"
        >
          <div className="space-y-2">
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
              className="block w-full rounded-md border bg-background p-3"
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
          <div className="space-y-2">
            <label htmlFor="login-password">Contraseña</label>
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
              className="block w-full rounded-md border bg-background p-3"
            />
            <button
              type="button"
              disabled={busy}
              aria-pressed={visible}
              aria-controls="login-password"
              onClick={() => setVisible((value) => !value)}
              className="underline"
            >
              {visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            </button>
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
            className="rounded-md bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50"
          >
            Iniciar sesión
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
