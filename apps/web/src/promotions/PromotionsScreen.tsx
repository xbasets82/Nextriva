import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader } from '../components/ui/card.js';
import {
  getPromotion,
  listPromotions,
  phaseLabels,
  promotionError,
  type Promotion,
} from '../api/promotions.js';
import type { Role } from '../api/users.js';
import { PromotionParticipants } from './PromotionParticipants.js';
import { PromotionForm } from './PromotionForm.js';
import { PromotionStatus } from './PromotionStatus.js';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'list'; promotions: Promotion[] }
  | { kind: 'detail'; promotion: Promotion };

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
          <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
            Promociones
          </h2>
          {role === 'ADMIN' && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            >
              Crear promoción
            </button>
          )}
          {state.promotions.length === 0 ? (
            <p>No hay promociones.</p>
          ) : (
            <ul className="grid gap-4">
              {state.promotions.map((promotion) => (
                <li key={promotion.id}>
                  <Card>
                    <CardHeader>
                      <h3 className="break-words text-xl font-semibold">
                        <a
                          href={`#/promotions/${promotion.id}`}
                          className="underline underline-offset-4"
                        >
                          {promotion.name}
                        </a>
                      </h3>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p>{promotion.location || 'Sin ubicación'}</p>
                      <p>
                        {promotion.status === 'ACTIVE' ? 'Activa' : 'Archivada'}
                      </p>
                      <PhaseList promotion={promotion} />
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {state.kind === 'detail' && (
        <>
          <a href="#/promotions" className="underline">
            Volver a promociones
          </a>
          <Card>
            <CardHeader>
              <h2
                ref={heading}
                tabIndex={-1}
                className="break-words text-2xl font-semibold"
              >
                {state.promotion.name}
              </h2>
            </CardHeader>
            <CardContent className="space-y-4 break-words">
              <p>
                {state.promotion.status === 'ACTIVE' ? 'Activa' : 'Archivada'}
              </p>
              <p>{state.promotion.description || 'Sin descripción'}</p>
              <p>{state.promotion.location || 'Sin ubicación'}</p>
              <h3 className="font-semibold">Fases activas</h3>
              <PhaseList promotion={state.promotion} />
            </CardContent>
          </Card>
          {state.promotion.status === 'ACTIVE' && (
            <a
              href={`#/incidents/new/${state.promotion.id}`}
              className="block underline"
            >
              Crear incidencia
            </a>
          )}
          <PromotionParticipants
            key={state.promotion.id}
            promotionId={state.promotion.id}
            role={role}
            archived={state.promotion.status === 'ARCHIVED'}
          />
          {role === 'ADMIN' &&
            state.promotion.status === 'ACTIVE' &&
            !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md border px-4 py-2"
              >
                Editar promoción
              </button>
            )}
          {role === 'ADMIN' && !editing && (
            <PromotionStatus
              promotion={state.promotion}
              onSaved={(promotion) => {
                if (isCurrentRoute()) setState({ kind: 'detail', promotion });
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
