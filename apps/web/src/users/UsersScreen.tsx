import { useEffect, useRef, useState } from 'react';
import {
  ApiError,
  currentUser,
  errorMessage,
  listUsers,
  type User,
} from '../api/users.js';

import { CreateUserForm, confirmDiscard } from './CreateUserForm.js';

type Screen =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; users: User[] };
const roleLabels = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  COLLABORATOR: 'Colaborador',
};

export function UsersScreen() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [editor, setEditor] = useState<User | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  function openEditor(next: User | 'new') {
    if (editor === next) return;
    if (!confirmDiscard(form.current)) return;
    setEditor(next);
    setMessage('');
  }
  const [message, setMessage] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (screen.kind === 'ready' && restoreFocus.current) {
      heading.current?.focus();
      restoreFocus.current = false;
    }
  }, [screen]);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const user = await currentUser();
        if (!active) return;
        if (user.role !== 'ADMIN') {
          setScreen({ kind: 'forbidden' });
          return;
        }
        const users = await listUsers();
        if (active) setScreen({ kind: 'ready', users });
      } catch (failure) {
        if (active)
          setScreen(
            failure instanceof ApiError && failure.status === 401
              ? { kind: 'anonymous' }
              : { kind: 'error', message: errorMessage(failure) },
          );
      }
    }
    setScreen({ kind: 'loading' });
    void load();
    return () => {
      active = false;
    };
  }, [attempt]);
  if (screen.kind === 'loading')
    return <p role="status">Consultando usuarios…</p>;
  if (screen.kind === 'anonymous')
    return <p>Se necesita una sesión iniciada para consultar usuarios.</p>;
  if (screen.kind === 'forbidden')
    return <p>No tienes permisos para gestionar usuarios.</p>;
  if (screen.kind === 'error')
    return (
      <section aria-label="Usuarios">
        <p role="alert">{screen.message}</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          Reintentar
        </button>
      </section>
    );
  return (
    <section aria-labelledby="users-title" className="space-y-5">
      <h2
        id="users-title"
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-semibold"
      >
        Usuarios
      </h2>
      {message && <p role="status">{message}</p>}
      {editor ? (
        <CreateUserForm
          key={editor === 'new' ? 'new' : editor.id}
          user={editor === 'new' ? undefined : editor}
          formRef={form}
          onBusy={setSaving}
          onSaved={() => {
            setEditor(null);
            setMessage(
              editor === 'new' ? 'Usuario creado.' : 'Usuario actualizado.',
            );
            restoreFocus.current = true;
            setAttempt((value) => value + 1);
          }}
          onCancel={() => {
            setEditor(null);
            heading.current?.focus();
          }}
        />
      ) : (
        <button type="button" onClick={() => openEditor('new')}>
          Crear usuario
        </button>
      )}
      {screen.users.length === 0 ? (
        <p>No hay usuarios.</p>
      ) : (
        <ul className="space-y-4">
          {screen.users.map((user) => (
            <li
              key={user.id}
              className="min-w-0 break-words rounded-xl border p-4"
            >
              <p className="font-semibold">
                {user.firstName} {user.lastName}
              </p>
              <p>{user.email}</p>
              <p>
                {roleLabels[user.role]} ·{' '}
                {user.isActive ? 'Activo' : 'Inactivo'}
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() => openEditor(user)}
                aria-label={`Editar ${user.email}`}
              >
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
