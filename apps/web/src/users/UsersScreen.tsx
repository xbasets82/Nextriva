import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import {
  ApiError,
  currentUser,
  errorMessage,
  listUsers,
  setUserStatus,
  type User,
} from '../api/users.js';

import {
  CreateUserForm,
  confirmDiscard,
  userFormActionClassName,
  userStatusCardClassName,
} from './CreateUserForm.js';

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
const usersPerPage = 10;

const iconButton =
  'inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 motion-reduce:transition-none';
const destructiveIconButton = iconButton
  .replace('text-muted-foreground', 'text-destructive')
  .replace('hover:bg-muted', 'hover:bg-destructive/10')
  .replace('hover:text-foreground', 'hover:text-destructive');
function IconTooltipButton({
  label,
  describedBy,
  wrapperClassName,
  className,
  children,
  ...buttonProps
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string;
  describedBy?: string;
  wrapperClassName?: string;
  children: ReactNode;
}) {
  const tooltipId = useId();
  const [pointerInside, setPointerInside] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const tooltipOpen = (pointerInside || focusWithin) && !tooltipDismissed;
  useEffect(() => {
    if (!tooltipOpen) return;

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setTooltipDismissed(true);
    }

    document.addEventListener('keydown', dismissOnEscape);
    return () => document.removeEventListener('keydown', dismissOnEscape);
  }, [tooltipOpen]);

  return (
    <span
      className={`${wrapperClassName ?? ''} group relative inline-flex`}
      onMouseEnter={() => {
        setPointerInside(true);
        setTooltipDismissed(false);
      }}
      onMouseLeave={() => {
        setPointerInside(false);
        if (!focusWithin) setTooltipDismissed(false);
      }}
      onFocusCapture={() => {
        setFocusWithin(true);
        setTooltipDismissed(false);
      }}
      onBlurCapture={() => {
        setFocusWithin(false);
        if (!pointerInside) setTooltipDismissed(false);
      }}
    >
      <button
        {...buttonProps}
        type="button"
        aria-label={label}
        aria-describedby={[describedBy, tooltipId].filter(Boolean).join(' ')}
        className={className}
      >
        {children}
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-auto absolute right-0 top-full z-20 w-max max-w-48 rounded-md bg-foreground px-2 pb-1 pt-2 text-xs text-background transition-opacity motion-reduce:transition-none ${tooltipOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}
      >
        {label}
      </span>
    </span>
  );
}
function UserIcon({
  kind,
}: {
  kind: 'create' | 'edit' | 'active' | 'inactive';
}) {
  const paths = {
    create: 'M19 8v6M16 11h6',
    edit: 'm16 3 5 5-12 12H4v-5L16 3ZM13 6l5 5',
    active: 'm16 11 2 2 4-4',
    inactive: 'm17 8 5 5M17 13l5-5',
  };
  return (
    <svg
      aria-hidden="true"
      data-icon={
        {
          create: 'user-round-plus',
          edit: 'pencil',
          active: 'user-round-check',
          inactive: 'user-round-x',
        }[kind]
      }
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind !== 'edit' && (
        <g data-user-silhouette>
          <circle cx="9" cy="7" r="4" />
          <path d="M2 21v-2a7 7 0 0 1 14 0v2" />
        </g>
      )}
      <path d={paths[kind]} />
    </svg>
  );
}
function FilterChevron() {
  return (
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
  );
}
function ClearFiltersIcon() {
  return (
    <svg
      aria-hidden="true"
      data-icon="filter-x"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h16l-6.5 7.5V19l-3 1v-7.5L4 5Z" />
      <path d="m17 15 5 5m0-5-5 5" />
    </svg>
  );
}
export function UsersScreen() {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [editor, setEditor] = useState<User | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<User | null>(null);
  const [failure, setFailure] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const confirmationRegion = useRef<HTMLDivElement>(null);
  const confirmationTrigger = useRef<HTMLButtonElement | null>(null);
  const restoreTriggerFocus = useRef(false);
  const listPosition = useRef({ left: 0, top: 0 });
  const restorePosition = useRef(false);
  useLayoutEffect(() => {
    if (restorePosition.current) {
      window.scrollTo({ ...listPosition.current, behavior: 'instant' });
      restorePosition.current = false;
    }
  });
  async function refreshUsers() {
    const users = await listUsers();
    setScreen({ kind: 'ready', users });
    return users;
  }
  function openEditor(next: User | 'new') {
    if (editor === next) return;
    if (!confirmDiscard(form.current)) return;
    listPosition.current = { left: window.scrollX, top: window.scrollY };
    setEditor(next);
    setMessage('');
  }
  const [message, setMessage] = useState('');
  async function changeStatus(user: User) {
    setSaving(true);
    setMessage('');
    setFailure('');
    let applied = false;
    try {
      await setUserStatus(user.id, { isActive: !user.isActive });
      applied = true;
      setScreen((current) =>
        current.kind === 'ready'
          ? {
              ...current,
              users: current.users.map((item) =>
                item.id === user.id
                  ? { ...item, isActive: !user.isActive }
                  : item,
              ),
            }
          : current,
      );
      await refreshUsers();
      setConfirmation(null);
      setMessage('Estado actualizado.');
      restoreFocus.current = true;
      restorePosition.current = true;
    } catch (error) {
      restoreTriggerFocus.current = true;
      setConfirmation(null);
      setFailure(
        `${applied ? 'El estado se actualizó, pero no se pudo actualizar el listado. ' : ''}${errorMessage(error)}`,
      );
    } finally {
      setSaving(false);
    }
  }
  const heading = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (confirmation) {
      confirmationRegion.current
        ?.querySelector<HTMLButtonElement>('[data-safe-focus]')
        ?.focus();
    } else if (restoreTriggerFocus.current) {
      confirmationTrigger.current?.focus();
      restoreTriggerFocus.current = false;
    }
  }, [confirmation]);
  useEffect(() => {
    if (screen.kind === 'ready' && restoreFocus.current) {
      heading.current?.focus({ preventScroll: true });
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
  const search = query.trim().toLocaleLowerCase();
  const visibleUsers = screen.users.filter(
    (user) =>
      (!search ||
        `${user.firstName} ${user.lastName}`
          .toLocaleLowerCase()
          .includes(search) ||
        user.email.toLocaleLowerCase().includes(search)) &&
      (statusFilter === 'all' ||
        user.isActive === (statusFilter === 'active')) &&
      (roleFilter === 'all' || user.role === roleFilter),
  );
  const totalPages = Math.max(1, Math.ceil(visibleUsers.length / usersPerPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedUsers = visibleUsers.slice(
    (currentPage - 1) * usersPerPage,
    currentPage * usersPerPage,
  );
  return (
    <section aria-labelledby="users-title" className="space-y-5">
      <header className="flex items-center justify-between gap-4">
        <h2
          id="users-title"
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-semibold"
        >
          Usuarios
        </h2>
        {!editor && (
          <IconTooltipButton
            type="button"
            label="Crear usuario"
            className={`${iconButton} border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground`}
            disabled={saving || confirmation !== null}
            onClick={() => openEditor('new')}
          >
            <UserIcon kind="create" />
          </IconTooltipButton>
        )}
      </header>
      {message && <p role="status">{message}</p>}
      {failure && <p role="alert">{failure}</p>}
      {confirmation && (
        <div
          ref={confirmationRegion}
          role="alertdialog"
          aria-labelledby="status-confirm-title"
          aria-describedby="status-confirm-description"
          className={`${userStatusCardClassName} mx-auto w-full max-w-2xl`}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !saving) {
              event.preventDefault();
              restoreTriggerFocus.current = true;
              setConfirmation(null);
            }
          }}
        >
          <h3 id="status-confirm-title" className="font-medium">
            Confirmar cambio de estado
          </h3>
          <p id="status-confirm-description">
            ¿{confirmation.isActive ? 'Desactivar' : 'Activar'} a{' '}
            {confirmation.email}? La operación puede revocar sus sesiones. Los
            demás campos no se guardarán.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className={userFormActionClassName}
              disabled={saving}
              data-safe-focus
              onClick={() => {
                restoreTriggerFocus.current = true;
                setConfirmation(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={userFormActionClassName}
              disabled={saving}
              onClick={() => void changeStatus(confirmation)}
            >
              Confirmar {confirmation.isActive ? 'desactivación' : 'activación'}
            </button>
          </div>
        </div>
      )}
      {editor ? (
        <CreateUserForm
          key={editor === 'new' ? 'new' : editor.id}
          user={editor === 'new' ? undefined : editor}
          formRef={form}
          onBusy={setSaving}
          onRefresh={refreshUsers}
          onSaved={async () => {
            await refreshUsers();
            setEditor(null);
            restorePosition.current = true;
            setMessage(
              editor === 'new' ? 'Usuario creado.' : 'Usuario actualizado.',
            );
            restoreFocus.current = true;
          }}
          onCancel={() => {
            restorePosition.current = true;
            setEditor(null);
            heading.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
        <label className="grid min-w-0 gap-3 text-sm">
          <span>Buscar usuarios</span>
          <input
            type="search"
            value={query}
            disabled={confirmation !== null || saving}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Nombre o email"
            className="w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring"
          />
        </label>
        <div className="grid gap-3 text-sm">
          <label htmlFor="users-status-filter">Estado</label>
          <div className="relative">
            <select
              id="users-status-filter"
              value={statusFilter}
              disabled={confirmation !== null || saving}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="block w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 pr-10 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
            <FilterChevron />
          </div>
        </div>
        <div className="grid gap-3 text-sm">
          <label htmlFor="users-role-filter">Rol</label>
          <div className="relative">
            <select
              id="users-role-filter"
              value={roleFilter}
              disabled={confirmation !== null || saving}
              onChange={(event) => {
                setRoleFilter(event.target.value);
                setPage(1);
              }}
              className="block w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 pr-10 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="all">Todos</option>
              <option value="ADMIN">Administrador</option>
              <option value="MANAGER">Gestor</option>
              <option value="COLLABORATOR">Colaborador</option>
            </select>
            <FilterChevron />
          </div>
        </div>
        <IconTooltipButton
          type="button"
          label="Limpiar filtros"
          disabled={confirmation !== null || saving}
          wrapperClassName="self-end"
          className={iconButton}
          onClick={() => {
            setQuery('');
            setStatusFilter('all');
            setRoleFilter('all');
            setPage(1);
          }}
        >
          <ClearFiltersIcon />
        </IconTooltipButton>
      </div>
      {screen.users.length === 0 && <p>No hay usuarios.</p>}
      {screen.users.length > 0 && visibleUsers.length === 0 && (
        <p role="status">No hay usuarios que coincidan con los filtros.</p>
      )}
      {visibleUsers.length > 0 && (
        <ul className="space-y-2">
          {paginatedUsers.map((user) => (
            <li
              key={user.id}
              className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="break-words font-medium">
                    {user.firstName} {user.lastName}
                  </p>
                  <p
                    id={`user-email-${user.id}`}
                    className="min-w-0 break-all text-sm text-muted-foreground"
                  >
                    {user.email}
                  </p>
                </div>
                <p>
                  {roleLabels[user.role]} ·{' '}
                  <span
                    role="img"
                    aria-label={user.isActive ? 'Activo' : 'Inactivo'}
                  >
                    <svg
                      aria-hidden="true"
                      data-icon={
                        user.isActive ? 'circle-check' : 'circle-pause'
                      }
                      className="inline-block align-middle"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path
                        d={user.isActive ? 'm8 12 3 3 5-6' : 'M9 9v6M15 9v6'}
                      />
                    </svg>
                  </span>
                </p>
              </div>
              <IconTooltipButton
                type="button"
                disabled={saving || confirmation !== null}
                onClick={() => openEditor(user)}
                className={iconButton}
                label="Editar usuario"
                describedBy={`user-email-${user.id}`}
              >
                <UserIcon kind="edit" />
              </IconTooltipButton>
              <IconTooltipButton
                type="button"
                disabled={saving || editor !== null || confirmation !== null}
                onClick={(event) => {
                  listPosition.current = {
                    left: window.scrollX,
                    top: window.scrollY,
                  };
                  confirmationTrigger.current = event.currentTarget;
                  setConfirmation(user);
                }}
                className={
                  user.isActive
                    ? `${destructiveIconButton} border-destructive/40`
                    : iconButton
                }
                label={user.isActive ? 'Desactivar usuario' : 'Activar usuario'}
                describedBy={`user-email-${user.id}`}
              >
                <UserIcon kind={user.isActive ? 'inactive' : 'active'} />
              </IconTooltipButton>
            </li>
          ))}
        </ul>
      )}
      {visibleUsers.length > 0 && (
        <nav
          aria-label="Paginación de usuarios"
          className="flex items-center justify-center gap-3"
        >
          <button
            type="button"
            className="min-h-10 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Página anterior"
            disabled={currentPage === 1 || confirmation !== null || saving}
            onClick={() => setPage(currentPage - 1)}
          >
            Anterior
          </button>
          <span aria-live="polite">
            Página {currentPage} de {totalPages}
          </span>
          <button
            type="button"
            className="min-h-10 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Página siguiente"
            disabled={
              currentPage === totalPages || confirmation !== null || saving
            }
            onClick={() => setPage(currentPage + 1)}
          >
            Siguiente
          </button>
        </nav>
      )}
    </section>
  );
}
