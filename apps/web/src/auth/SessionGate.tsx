import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, currentUser, type User } from '../api/users.js';
import { LoginForm } from './LoginForm.js';
import { AuthCoordinationError, logout } from '../api/auth.js';
import { onSessionExpired, sessionRevision } from '../api/transport.js';
import { resolveAuthenticatedRoute } from './navigation.js';

type Session =
  | { kind: 'loading' | 'closing' | 'anonymous' | 'error' | 'forbidden' }
  | { kind: 'authenticated'; user: User };

export function SessionGate({
  children,
}: {
  children: ReactNode | ((user: User, logoutControl: ReactNode) => ReactNode);
}) {
  const [session, setSession] = useState<Session>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const returnRoute = useRef(window.location.hash);
  const pending = useRef(false);
  const expiredWhileClosing = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const unsubscribe = onSessionExpired(() => {
      if (pending.current) {
        expiredWhileClosing.current = true;
        setSession({ kind: 'closing' });
      } else {
        setSession({ kind: 'anonymous' });
      }
      setFailure('');
    });
    return () => {
      active.current = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (session.kind === 'anonymous') {
      if (window.location.hash !== '#/login')
        returnRoute.current = window.location.hash;
      if (window.location.hash !== '#/login')
        window.location.replace('#/login');
    }
  }, [session.kind]);
  async function closeSession() {
    if (pending.current) return;
    pending.current = true;
    expiredWhileClosing.current = false;
    setBusy(true);
    setFailure('');
    try {
      await logout();
      if (active.current) {
        setSession({ kind: 'anonymous' });
        returnRoute.current = '';
        window.location.replace('#/login');
      }
    } catch (error) {
      if (!active.current) return;
      if (
        (error instanceof ApiError && error.status === 401) ||
        expiredWhileClosing.current
      ) {
        setSession({ kind: 'anonymous' });
        returnRoute.current = '';
      } else {
        setFailure(
          error instanceof AuthCoordinationError
            ? error.message
            : 'No se pudo cerrar la sesión. Inténtalo de nuevo.',
        );
      }
    } finally {
      pending.current = false;
      expiredWhileClosing.current = false;
      if (active.current) setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    const revision = sessionRevision();
    setSession({ kind: 'loading' });
    void currentUser().then(
      (user) => {
        if (active && revision === sessionRevision()) {
          const destination = resolveAuthenticatedRoute(
            window.location.hash,
            user.role,
          );
          if (window.location.hash !== destination)
            window.location.hash = destination;
          setSession({ kind: 'authenticated', user });
        }
      },
      (error: unknown) => {
        if (active && revision === sessionRevision()) {
          let kind: 'anonymous' | 'forbidden' | 'error' = 'error';
          if (error instanceof ApiError && error.status === 401)
            kind = 'anonymous';
          if (error instanceof ApiError && error.status === 403)
            kind = 'forbidden';
          setSession({ kind });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  if (session.kind === 'loading')
    return <p role="status">Comprobando sesión…</p>;
  if (session.kind === 'closing') return <p role="status">Cerrando sesión…</p>;
  if (session.kind === 'anonymous')
    return (
      <LoginForm
        onAuthenticated={(user) => {
          setSession({ kind: 'authenticated', user });
          window.location.hash = resolveAuthenticatedRoute(
            returnRoute.current,
            user.role,
          );
        }}
      />
    );
  if (session.kind === 'forbidden')
    return (
      <section>
        <p role="alert">No tienes acceso a esta sesión.</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          Reintentar
        </button>
      </section>
    );
  if (session.kind === 'error')
    return (
      <section>
        <p role="alert">No se pudo comprobar la sesión. Inténtalo de nuevo.</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          Reintentar
        </button>
      </section>
    );
  const logoutControl = (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label="Cerrar sesión"
        disabled={busy}
        onClick={() => void closeSession()}
        className="inline-flex size-11 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
      >
        <svg
          aria-hidden="true"
          data-icon="log-out"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
        >
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
          <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
        </svg>
      </button>
      {busy && (
        <p role="status" className="max-w-48 text-right text-sm">
          Cerrando sesión…
        </p>
      )}
      {failure && (
        <p role="alert" className="max-w-48 text-right text-sm">
          {failure}
        </p>
      )}
    </div>
  );
  return session.kind === 'authenticated' && typeof children === 'function' ? (
    children(session.user, logoutControl)
  ) : (
    <>
      {logoutControl}
      {session.kind === 'authenticated' ? children : null}
    </>
  );
}
