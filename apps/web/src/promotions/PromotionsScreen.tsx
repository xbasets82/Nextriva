import { useEffect, useRef, useState } from 'react';
import {
  getPromotion,
  listPromotions,
  phaseLabels,
  phases,
  promotionError,
  type Phase,
  type Promotion,
} from '../api/promotions.js';
import type { Role } from '../api/users.js';
import { PromotionIncidents } from './PromotionIncidents.js';
import { PromotionParticipants } from './PromotionParticipants.js';
import { PromotionForm } from './PromotionForm.js';
import { PromotionStatus } from './PromotionStatus.js';

import {
  FilterChevron,
  iconButtonClassName,
  PromotionIcon,
  PromotionAction,
  PromotionStateIndicator,
} from './PromotionControls.js';

const promotionsPerPage = 10;

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'list'; promotions: Promotion[] }
  | { kind: 'detail'; promotion: Promotion };

function filterPromotions(
  promotions: Promotion[],
  query: string,
  statusFilter: Promotion['status'] | 'all',
  phaseFilter: Phase | 'all',
) {
  const search = query.trim().toLocaleLowerCase();
  return promotions
    .filter((promotion) => {
      const matchesQuery =
        !search ||
        promotion.name.toLocaleLowerCase().includes(search) ||
        (promotion.location ?? '').toLocaleLowerCase().includes(search);
      return (
        matchesQuery &&
        (statusFilter === 'all' || promotion.status === statusFilter) &&
        (phaseFilter === 'all' || promotion.phases.includes(phaseFilter))
      );
    })
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
}

function PhaseList({ promotion }: { promotion: Promotion }) {
  return (
    <ul aria-label="Fases activas" className="flex flex-wrap gap-2">
      {promotion.phases.map((phase) => (
        <li key={phase} className="rounded-full bg-muted px-3 py-1 text-sm">
          {phaseLabels[phase]}
        </li>
      ))}
    </ul>
  );
}

export function PromotionsScreen({
  id,
  role,
}: {
  id: string | undefined;
  role: Role;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Promotion['status'] | 'all'>(
    'all',
  );
  const [phaseFilter, setPhaseFilter] = useState<Phase | 'all'>('all');
  const [page, setPage] = useState(1);
  const currentRoute = id ? `#/promotions/${id}` : '#/promotions';
  const isCurrentRoute = () => {
    const hash = window.location.hash;
    const normalizedHash = hash.endsWith('/') ? hash.slice(0, -1) : hash;
    return normalizedHash === currentRoute;
  };
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!editing && (state.kind === 'list' || state.kind === 'detail'))
      heading.current?.focus();
  }, [editing, state.kind]);
  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    setEditing(false);
    async function load() {
      try {
        const result: State = id
          ? { kind: 'detail', promotion: await getPromotion(id) }
          : { kind: 'list', promotions: await listPromotions() };
        if (active) setState(result);
      } catch (error) {
        if (active) setState({ kind: 'error', message: promotionError(error) });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id, attempt]);
  const visiblePromotions =
    state.kind === 'list'
      ? filterPromotions(state.promotions, query, statusFilter, phaseFilter)
      : [];
  const totalPages = Math.max(
    1,
    Math.ceil(visiblePromotions.length / promotionsPerPage),
  );
  const currentPage = Math.min(page, totalPages);
  const pagePromotions = visiblePromotions.slice(
    (currentPage - 1) * promotionsPerPage,
    currentPage * promotionsPerPage,
  );
  return (
    <section aria-label="Promociones" className="space-y-5">
      {editing && (state.kind === 'list' || state.kind === 'detail') && (
        <PromotionForm
          promotion={state.kind === 'detail' ? state.promotion : undefined}
          onCancel={() => setEditing(false)}
          onSaved={(promotion) => {
            if (!isCurrentRoute()) return;
            setEditing(false);
            setState({ kind: 'detail', promotion });
            window.location.hash = `/promotions/${promotion.id}`;
          }}
        />
      )}
      {state.kind === 'loading' && (
        <p role="status">Consultando promociones…</p>
      )}
      {state.kind === 'error' && (
        <>
          <p role="alert">{state.message}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Reintentar
          </button>
        </>
      )}
      {state.kind === 'list' && (
        <>
          <header className="flex items-center justify-between gap-4">
            <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
              Promociones
            </h2>
            {role === 'ADMIN' && !editing && (
              <button
                type="button"
                aria-label="Crear promoción"
                title="Crear promoción"
                onClick={() => setEditing(true)}
                className={`${iconButtonClassName} border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground`}
              >
                <PromotionIcon kind="create" />
              </button>
            )}
          </header>
          <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
            <label className="grid min-w-0 gap-3 text-sm">
              <span>Buscar promociones</span>
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Nombre o localización"
                className="w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring"
              />
            </label>
            <div className="grid gap-3 text-sm">
              <label htmlFor="promotions-status-filter">Estado</label>
              <div className="relative">
                <select
                  id="promotions-status-filter"
                  value={statusFilter}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (
                      value === 'all' ||
                      value === 'ACTIVE' ||
                      value === 'ARCHIVED'
                    )
                      setStatusFilter(value);
                    setPage(1);
                  }}
                  className="block w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 pr-10 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <option value="all">Todas</option>
                  <option value="ACTIVE">Activas</option>
                  <option value="ARCHIVED">Archivadas</option>
                </select>
                <FilterChevron />
              </div>
            </div>
            <div className="grid gap-3 text-sm">
              <label htmlFor="promotions-phase-filter">Fase activa</label>
              <div className="relative">
                <select
                  id="promotions-phase-filter"
                  value={phaseFilter}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPhaseFilter(
                      value === 'all'
                        ? value
                        : (phases.find((phase) => phase === value) ?? 'all'),
                    );
                    setPage(1);
                  }}
                  className="block w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 pr-10 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <option value="all">Todas las fases</option>
                  {phases.map((phase) => (
                    <option key={phase} value={phase}>
                      {phaseLabels[phase]}
                    </option>
                  ))}
                </select>
                <FilterChevron />
              </div>
            </div>
            <button
              type="button"
              aria-label="Limpiar filtros"
              title="Limpiar filtros"
              className={`${iconButtonClassName} self-end`}
              onClick={() => {
                setQuery('');
                setStatusFilter('all');
                setPhaseFilter('all');
                setPage(1);
              }}
            >
              <PromotionIcon kind="clear" />
            </button>
          </div>
          {state.promotions.length === 0 && <p>No hay promociones.</p>}
          {state.promotions.length > 0 && visiblePromotions.length === 0 && (
            <p role="status">
              No hay promociones que coincidan con los filtros.
            </p>
          )}
          {visiblePromotions.length > 0 && (
            <>
              <ul aria-label="Listado de promociones" className="grid gap-2">
                {pagePromotions.map((promotion) => (
                  <li
                    key={promotion.id}
                    className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
                      <a
                        href={`#/promotions/${promotion.id}`}
                        className="min-w-0 font-medium underline underline-offset-4 [overflow-wrap:anywhere]"
                      >
                        {promotion.name}
                      </a>
                      <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                        <PromotionIcon kind="location" />
                        {promotion.location || 'Sin ubicación'}
                      </span>
                    </div>
                    <PromotionStateIndicator status={promotion.status} />
                    <PhaseList promotion={promotion} />
                  </li>
                ))}
              </ul>
              <nav
                aria-label="Paginación de promociones"
                className="flex items-center justify-center gap-3"
              >
                <button
                  type="button"
                  aria-label="Página anterior"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="min-h-10 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <span aria-live="polite">
                  Página {currentPage} de {totalPages} ·{' '}
                  {visiblePromotions.length} promociones
                </span>
                <button
                  type="button"
                  aria-label="Página siguiente"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  className="min-h-10 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </nav>
            </>
          )}
        </>
      )}
      {state.kind === 'detail' && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <PromotionAction
                label="Volver a promociones"
                icon="back"
                href="#/promotions"
              />
              <h2
                ref={heading}
                tabIndex={-1}
                className="min-w-0 text-2xl font-semibold [overflow-wrap:anywhere]"
              >
                {state.promotion.name}
              </h2>
              <PromotionStateIndicator status={state.promotion.status} />
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {state.promotion.status === 'ACTIVE' && (
                <PromotionAction
                  label="Crear incidencia"
                  icon="incident"
                  href={`#/incidents/new/${state.promotion.id}`}
                />
              )}
              {role === 'ADMIN' &&
                state.promotion.status === 'ACTIVE' &&
                !editing && (
                  <PromotionAction
                    label="Editar promoción"
                    icon="edit"
                    onClick={() => setEditing(true)}
                  />
                )}
              {role === 'ADMIN' && !editing && (
                <PromotionStatus
                  promotion={state.promotion}
                  onSaved={(promotion) => {
                    if (isCurrentRoute())
                      setState({ kind: 'detail', promotion });
                  }}
                />
              )}
            </div>
          </header>
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
              <PromotionIcon kind="location" />
              {state.promotion.location || 'Sin ubicación'}
            </p>
            <p className="text-sm [overflow-wrap:anywhere]">
              {state.promotion.description || 'Sin descripción'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <PhaseList promotion={state.promotion} />
            </div>
          </div>
          <PromotionIncidents
            key={`incidents-${state.promotion.id}`}
            promotionId={state.promotion.id}
          />
          <PromotionParticipants
            key={state.promotion.id}
            promotionId={state.promotion.id}
            role={role}
            archived={state.promotion.status === 'ARCHIVED'}
          />
        </>
      )}
    </section>
  );
}
