import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader } from '../components/ui/card.js';
import {
  addParticipant,
  removeParticipant,
  eligibleParticipants,
  listParticipants,
  participantError,
  type Candidate,
  type Participant,
} from '../api/participants.js';
import type { Role } from '../api/users.js';
import {
  FilterChevron,
  PromotionAction,
  PromotionIcon,
} from './PromotionControls.js';

const roleLabels = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  COLLABORATOR: 'Colaborador',
};

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; participants: Participant[]; candidates: Candidate[] };
export function PromotionParticipants({
  promotionId,
  role,
  archived,
}: {
  promotionId: string;
  role: Role;
  archived: boolean;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState('');
  const [confirming, setConfirming] = useState<Participant['user'] | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const pending = useRef(false);
  const active = useRef(true);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!confirming && restoreFocus.current) {
      trigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [confirming]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);
  const manages = role === 'ADMIN' || role === 'MANAGER';
  useEffect(() => {
    let active = true;
    setState({ kind: 'loading' });
    void Promise.all([
      listParticipants(promotionId),
      manages && !archived
        ? eligibleParticipants(promotionId)
        : Promise.resolve([]),
    ]).then(
      ([participants, candidates]) => {
        if (active) setState({ kind: 'ready', participants, candidates });
      },
      (error: unknown) => {
        if (active)
          setState({ kind: 'error', message: participantError(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [promotionId, manages, archived, attempt]);
  async function save(userId: string, remove: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await (remove ? removeParticipant : addParticipant)(promotionId, userId);
      if (!active.current) return;
      setSelected('');
      setConfirming(null);
      let text = 'Participante añadido.';
      if (remove) {
        text =
          confirming?.role === 'ADMIN'
            ? 'Vinculación retirada. El administrador mantiene su acceso global.'
            : 'Participante retirado. Su acceso a esta promoción ha sido revocado.';
      }
      setFeedback({ error: false, text });
      setAttempt((value) => value + 1);
    } catch (error) {
      if (active.current) {
        setConfirming(null);
        setFeedback({ error: true, text: participantError(error) });
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  function cancel() {
    restoreFocus.current = true;
    setConfirming(null);
  }
  return (
    <Card>
      <CardHeader>
        <h3 className="text-xl font-semibold">Participantes</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback && (
          <p
            ref={feedbackRef}
            tabIndex={-1}
            role={feedback.error ? 'alert' : 'status'}
          >
            {feedback.text}
          </p>
        )}
        {busy && <p role="status">Guardando participantes…</p>}
        {state.kind === 'loading' && (
          <p role="status">Consultando participantes…</p>
        )}
        {state.kind === 'error' && (
          <>
            <p role="alert">{state.message}</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Reintentar participantes
            </button>
          </>
        )}
        {state.kind === 'ready' && (
          <>
            {state.participants.length === 0 ? (
              <p>No hay participantes vinculados.</p>
            ) : (
              <ul aria-label="Participantes vinculados" className="grid gap-2">
                {state.participants.map(({ user }) => (
                  <li
                    key={user.id}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-medium [overflow-wrap:anywhere]">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="min-w-0 break-all text-sm text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                      <p>
                        {roleLabels[user.role]} ·{' '}
                        <span
                          role="img"
                          aria-label={user.isActive ? 'Activo' : 'Inactivo'}
                          className="inline-block align-middle"
                        >
                          <PromotionIcon
                            kind={user.isActive ? 'active' : 'archived'}
                          />
                        </span>
                      </p>
                    </div>
                    {manages &&
                      (role === 'ADMIN' ||
                        (user.role === 'COLLABORATOR' && user.isActive)) && (
                        <PromotionAction
                          label={`Retirar ${user.firstName} ${user.lastName}`}
                          icon="remove"
                          disabled={busy || confirming !== null}
                          onClick={(event) => {
                            trigger.current = event.currentTarget;
                            setFeedback(null);
                            setConfirming(user);
                          }}
                        />
                      )}
                  </li>
                ))}
              </ul>
            )}
            {manages && !archived && (
              <div className="flex min-w-0 items-center gap-2">
                <label
                  className="sr-only"
                  htmlFor={`participant-candidate-${promotionId}`}
                >
                  Colaborador
                </label>
                <div className="relative min-w-0 flex-1">
                  <select
                    id={`participant-candidate-${promotionId}`}
                    className="block min-h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-background py-2 pl-3 pr-10 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                    value={selected}
                    disabled={busy || confirming !== null}
                    onChange={(event) => setSelected(event.target.value)}
                  >
                    <option value="">Seleccionar colaborador</option>
                    {state.candidates.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName} · {user.email}
                      </option>
                    ))}
                  </select>
                  <FilterChevron />
                </div>
                <PromotionAction
                  label="Añadir participante"
                  icon="add"
                  disabled={!selected || busy || confirming !== null}
                  onClick={() => void save(selected, false)}
                />
              </div>
            )}
            {manages && !archived && state.candidates.length === 0 && (
              <p>No hay colaboradores elegibles disponibles.</p>
            )}
            {confirming && (
              <div
                role="dialog"
                aria-label="Retirar participante"
                aria-describedby="participant-removal-description"
                aria-busy={busy}
                className="space-y-3 rounded-md border p-4"
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && !busy) {
                    event.preventDefault();
                    cancel();
                  }
                }}
              >
                <h4 className="font-semibold">Retirar participante</h4>
                <p id="participant-removal-description">
                  ¿Retirar a {confirming.firstName} {confirming.lastName}?
                  Perderá el acceso por vinculación a esta promoción. Se
                  conserva la autoría histórica; ADMIN mantiene su acceso
                  global.
                </p>
                <button
                  type="button"
                  autoFocus
                  disabled={busy}
                  onClick={cancel}
                  className="rounded-md border px-4 py-2"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(confirming.id, true)}
                  className="rounded-md border px-4 py-2"
                >
                  Confirmar retirada
                </button>
              </div>
            )}
            {archived && (
              <p>La promoción archivada no permite añadir participantes.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
