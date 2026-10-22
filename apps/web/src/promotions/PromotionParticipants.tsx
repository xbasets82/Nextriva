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
              <ul aria-label="Participantes vinculados" className="space-y-3">
                {state.participants.map(({ user }) => (
                  <li key={user.id} className="break-words">
                    {user.firstName} {user.lastName} · {user.email} ·{' '}
                    {user.role}
                    {!user.isActive && ' · Inactivo'}
                    {manages &&
                      (role === 'ADMIN' ||
                        (user.role === 'COLLABORATOR' && user.isActive)) && (
                        <button
                          className="ml-3 rounded-md border px-3 py-2"
                          type="button"
                          disabled={busy || confirming !== null}
                          aria-label={`Retirar ${user.firstName} ${user.lastName}`}
                          onClick={(event) => {
                            trigger.current = event.currentTarget;
                            setFeedback(null);
                            setConfirming(user);
                          }}
                        >
                          Retirar
                        </button>
                      )}
                  </li>
                ))}
              </ul>
            )}
            {manages && !archived && (
              <div>
                <label
                  className="block"
                  htmlFor={`participant-candidate-${promotionId}`}
                >
                  Colaborador
                </label>
                <select
                  id={`participant-candidate-${promotionId}`}
                  className="block w-full rounded-md border p-2"
                  value={selected}
                  disabled={busy || confirming !== null}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  <option value="">Selecciona un colaborador</option>
                  {state.candidates.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.firstName} {user.lastName} · {user.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {manages && !archived && (
              <button
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
                type="button"
                disabled={!selected || busy || confirming !== null}
                onClick={() => void save(selected, false)}
              >
                Añadir participante
              </button>
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
